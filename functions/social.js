// Friend requests need mutual consent — see firestore.rules: `friends` on
// users/{uid} is now a server-managed field, same category as `coins`, and
// users/{uid}/friendRequests/{fromUid} is read-only from the client
// entirely. All three actions below run with the Admin SDK precisely so a
// "friendship" can never be self-granted or forced on someone by directly
// writing their array — every array change here always touches BOTH
// sides' documents together, which a client could never do on its own
// (rules only ever authorize a write against the CALLER's own uid).
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { enforceRateLimit } = require('./guards');

// Called by the sender. A plain client write into someone else's
// friendRequests subcollection isn't possible (see firestore.rules), so
// even "just send a request" has to be a callable — this also lets the
// recipient's `fromName` come from the sender's own verified doc instead
// of a client-supplied string.
//
// Two ways in, and they are not equally trusted:
//
//   * `code` — the original. A friend code is a capability: you can only
//     be added by someone you actually handed it to, so resolving one is
//     permission enough on its own.
//   * `targetUid` — for the Add buttons on a suggestion card and a search
//     result, neither of which has a code to send.
//
// The uid path used to additionally require the target to be a
// friend-of-a-friend, on the reasoning that a raw uid is not a capability
// the way a code is. Username search retired that check rather than
// working around it: search exists precisely so that people you have no
// connection to can find each other, so a rule saying "you may only
// contact people already near you in the graph" would either reject every
// interesting search result or reduce search to a list of people you can
// already reach. You cannot ship a discovery feature and a
// discovery-prevention rule at once; this app now chooses discovery.
//
// What still stands between this and a spam cannon: the target must be a
// real account, and the caller gets 20 requests an hour (guards.js). That
// is the ordinary posture for a social app, and it is a deliberate
// loosening — see functions/userSearch.js for the same note from the
// other side.
exports.sendFriendRequest = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  // Puts a request in someone else's inbox — verified email + hourly cap, see guards.js.
  const uid = request.auth.uid;
  const code = String(request.data?.code ?? '').trim().toUpperCase();
  const requestedUid = String(request.data?.targetUid ?? '').trim();
  if (!code && !requestedUid) throw new HttpsError('invalid-argument', 'Enter a code.');

  const db = getFirestore();

  let targetUid;
  if (code) {
    const codeSnap = await db.collection('friendCodes').doc(code).get();
    if (!codeSnap.exists) {
      throw new HttpsError('not-found', "No one found with that code — double check it and try again.");
    }
    targetUid = codeSnap.data().uid;
  } else {
    if (requestedUid === uid) throw new HttpsError('invalid-argument', "That's you.");
    // Existence is checked below, by the same targetSnap read the code
    // path uses — no separate probe here, so both routes fail identically
    // for a uid that is not an account.
    targetUid = requestedUid;
  }
  if (targetUid === uid) throw new HttpsError('invalid-argument', "That's your own code.");

  const [callerSnap, targetSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('users').doc(targetUid).get(),
  ]);
  if (!callerSnap.exists || !targetSnap.exists) {
    throw new HttpsError('failed-precondition', "Couldn't find that profile — try again in a moment.");
  }
  if ((callerSnap.data().friends ?? []).includes(targetUid)) {
    throw new HttpsError('already-exists', "You're already friends.");
  }

  // Only after the code resolved and the pair isn't already connected, so a
  // typo'd code doesn't cost the caller a slot. Throws 'resource-exhausted'.
  await enforceRateLimit(uid, 'friendRequest');

  const fromName = callerSnap.data().displayName ?? 'Someone';
  const targetRef = db.collection('users').doc(targetUid);
  const nowIso = new Date().toISOString();

  // Batched so the request and the notification announcing it land
  // together. Split into two awaits there would be a window where the
  // request exists and nothing tells the recipient — which is the exact
  // bug this change is here to fix, just narrower.
  const batch = db.batch();

  // set(), not create-only — sending a second request (e.g. after being
  // declined) just refreshes the existing one rather than erroring.
  batch.set(targetRef.collection('friendRequests').doc(uid), {
    fromUid: uid,
    fromName,
    status: 'pending',
    createdAt: nowIso,
  });

  // The inbox entry. sendPushOnNotificationCreate (functions/index.js)
  // watches this collection and turns any new doc into an OS push, so this
  // one write drives both surfaces and no push code belongs here.
  //
  // The doc id is derived from the SENDER rather than auto-generated, the
  // same identity-by-id trick as friendRequests/{fromUid} and likes/{likerUid}
  // above. Two consequences, both wanted:
  //
  //   * One inbox entry per pending sender. Re-sending cannot stack up ten
  //     copies of "Dana wants to be your friend."
  //   * onDocumentCreated fires on CREATE only, so a re-send while the
  //     entry is still sitting unread is silent. Push again only if they
  //     already cleared it — which is the difference between a reminder
  //     and being pestered, and it matters because the hourly cap still
  //     allows ~20 sends at one person.
  batch.set(targetRef.collection('notifications').doc(`friend_request_${uid}`), {
    type: 'friend_request',
    title: 'New Friend Request! 🐐',
    body: `${fromName} wants to be your friend.`,
    // Who it came from, so the inbox row can grow a tap-to-open-profile
    // later without a schema change. Same shape as cheerNotifications.js.
    data: { fromUid: uid, fromName },
    read: false,
    // An ISO string, NOT FieldValue.serverTimestamp(), and this is load-
    // bearing rather than stylistic. Two things downstream read this field
    // and both assume a string:
    //
    //   * NotificationsList.jsx's timeAgo() does new Date(value).getTime().
    //     A Firestore Timestamp gives Invalid Date → NaN → broken.
    //   * useNotifications runs orderBy('createdAt','desc'). Firestore's
    //     cross-type ordering ranks Timestamp BELOW String, so a
    //     serverTimestamp doc sorts under every existing ISO-string one:
    //     the newest notification would land at the BOTTOM of the inbox.
    //
    // Every other writer here (cheerNotifications.js, the two scheduled
    // jobs in index.js) uses toISOString() for the same reason. Moving to
    // serverTimestamp is a fine idea, but it is a migration of all four
    // writers plus both readers, not a per-call choice.
    createdAt: nowIso,
  });

  await batch.commit();

  return { targetName: targetSnap.data().displayName ?? 'Someone' };
});

// Called by the RECIPIENT. Accepting is the one moment `friends` actually
// changes — done inside a transaction that touches both users' docs at
// once, so there's never a window where only one side lists the other.
exports.respondToFriendRequest = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const fromUid = request.data?.fromUid;
  const accept = Boolean(request.data?.accept);
  if (typeof fromUid !== 'string' || !fromUid) throw new HttpsError('invalid-argument', 'Missing fromUid.');

  const db = getFirestore();
  const requestRef = db.collection('users').doc(uid).collection('friendRequests').doc(fromUid);

  // If the sender ALSO requested the recipient before this got answered
  // (both people add each other around the same time), there'd otherwise
  // be a second, now-pointless pending request sitting in the sender's own
  // inbox forever — already-friends, but still nagging them to accept
  // someone they're already connected to. Cleaned up here since accepting
  // is the one place that already knows both uids and that the answer is
  // "yes, connect them."
  const mirrorRequestRef = db.collection('users').doc(fromUid).collection('friendRequests').doc(uid);

  await db.runTransaction(async (tx) => {
    const reqSnap = await tx.get(requestRef);
    if (!reqSnap.exists) {
      throw new HttpsError('not-found', 'That request is gone — maybe it was already handled.');
    }
    if (accept) {
      tx.update(db.collection('users').doc(uid), { friends: FieldValue.arrayUnion(fromUid) });
      tx.update(db.collection('users').doc(fromUid), { friends: FieldValue.arrayUnion(uid) });
      tx.delete(mirrorRequestRef);
    }
    tx.delete(requestRef);
  });

  return { accepted: accept };
});

// Unfriending is symmetric too — removes the connection from both sides
// in one go, so nobody's left with a one-sided "ghost" friend the other
// person already dropped.
exports.removeFriend = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const friendUid = request.data?.friendUid;
  if (typeof friendUid !== 'string' || !friendUid) throw new HttpsError('invalid-argument', 'Missing friendUid.');

  const db = getFirestore();
  await db.runTransaction(async (tx) => {
    tx.update(db.collection('users').doc(uid), { friends: FieldValue.arrayRemove(friendUid) });
    tx.update(db.collection('users').doc(friendUid), { friends: FieldValue.arrayRemove(uid) });
  });

  return { removed: friendUid };
});
