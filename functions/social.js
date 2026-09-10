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
const { requireVerifiedEmail, enforceRateLimit } = require('./guards');

// Called by the sender. A plain client write into someone else's
// friendRequests subcollection isn't possible (see firestore.rules), so
// even "just send a request" has to be a callable — this also lets the
// recipient's `fromName` come from the sender's own verified doc instead
// of a client-supplied string.
exports.sendFriendRequest = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  // Puts a request in someone else's inbox — verified email + hourly cap, see guards.js.
  requireVerifiedEmail(request);
  const uid = request.auth.uid;
  const code = String(request.data?.code ?? '').trim().toUpperCase();
  if (!code) throw new HttpsError('invalid-argument', 'Enter a code.');

  const db = getFirestore();
  const codeSnap = await db.collection('friendCodes').doc(code).get();
  if (!codeSnap.exists) {
    throw new HttpsError('not-found', "No one found with that code — double check it and try again.");
  }
  const targetUid = codeSnap.data().uid;
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

  // set(), not create-only — sending a second request (e.g. after being
  // declined) just refreshes the existing one rather than erroring.
  await db.collection('users').doc(targetUid).collection('friendRequests').doc(uid).set({
    fromUid: uid,
    fromName: callerSnap.data().displayName ?? 'Someone',
    status: 'pending',
    createdAt: new Date().toISOString(),
  });

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
