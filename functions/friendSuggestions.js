// "People you might know" — friends of your friends, ranked by how many
// of them you share.
//
// WHY THIS IS A CALLABLE AND NOT A CLIENT QUERY
//
// The suggestion has to walk your friends' `friends` arrays, and those
// live on users/{uid}, which firestore.rules makes readable by its owner
// and a connected trainer only. There is no client-side version of this
// query that the rules would authorise, and widening that read to "anyone
// you're friends with" would hand every friend your email, coin balance
// and body-weight log to compute a list of names. The Admin SDK reads the
// graph; the client only ever receives the finished shortlist.
//
// WHAT THIS DELIBERATELY EXPOSES
//
// A suggestion says "you might know Dana — Yossi and Maya are friends
// with her." That is a real, if ordinary, disclosure about your friends'
// connections: it tells you Yossi is friends with Dana, which you had no
// way to learn before. Every mainstream social product makes exactly this
// trade, and the names it can ever mention are people you are already
// connected to — but it IS new, and it is the reason `via` is a separate
// field rather than baked into a string: dropping it from the return
// leaves a working count-only version ("2 mutual friends") with no names
// in it at all.
//
// Nothing here is an enumeration oracle. The caller supplies no input at
// all — candidates can only ever come out of the caller's own graph — so
// there is no query anyone can craft to ask "is this person a user?"
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');

// Fan-out caps. This function's cost is (friends read) + (shortlist read)
// + (summaries read), and the only unbounded input is how many friends
// the caller has, so that is the one that gets clamped.
const MAX_FRIENDS_SCANNED = 50;
const MAX_SUGGESTIONS = 10;
// Shortlist wider than we return, because the pending-request filter
// below removes an unknown number of them and re-ranking after a read is
// cheaper than a second round trip.
const SHORTLIST = MAX_SUGGESTIONS * 3;
const MAX_MUTUALS_NAMED = 3;

exports.suggestFriends = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const db = getFirestore();

  const meSnap = await db.collection('users').doc(uid).get();
  if (!meSnap.exists) return { suggestions: [] };

  const myFriends = (Array.isArray(meSnap.data().friends) ? meSnap.data().friends : []).slice(
    0,
    MAX_FRIENDS_SCANNED,
  );
  // No friends, no friends-of-friends. The cold-start case is real and
  // the UI has to handle it anyway (see FriendSuggestions.jsx), so it is
  // an empty list rather than an error.
  if (myFriends.length === 0) return { suggestions: [] };

  const friendSnaps = await db.getAll(...myFriends.map((f) => db.collection('users').doc(f)));

  // Everyone already accounted for: yourself, and anyone you are already
  // friends with.
  const excluded = new Set([uid, ...myFriends]);

  const tally = new Map();
  for (const snap of friendSnaps) {
    if (!snap.exists) continue;
    const data = snap.data();
    const viaName = data.displayName ?? 'A friend';
    for (const candidate of Array.isArray(data.friends) ? data.friends : []) {
      if (excluded.has(candidate)) continue;
      const entry = tally.get(candidate) ?? { count: 0, via: [] };
      entry.count += 1;
      if (entry.via.length < MAX_MUTUALS_NAMED) entry.via.push(viaName);
      tally.set(candidate, entry);
    }
  }
  if (tally.size === 0) return { suggestions: [] };

  // Most mutuals first. Ties broken by uid so the order is stable between
  // calls — a carousel that reshuffles every refresh reads as broken.
  const shortlist = [...tally.entries()]
    .sort((a, b) => b[1].count - a[1].count || (a[0] < b[0] ? -1 : 1))
    .slice(0, SHORTLIST);

  // Anyone with a request already in flight, either direction, is not a
  // suggestion — it would render an "Add" button that immediately errors
  // with already-exists, or worse, nag you to re-add someone who has not
  // answered yet.
  //
  // Incoming is one collection read of your own inbox. Outgoing needs a
  // point read per candidate (the request doc lives in THEIR inbox), so
  // it is batched into a single getAll over the shortlist rather than a
  // loop of awaits.
  const [incomingSnap, outgoingSnaps] = await Promise.all([
    db.collection('users').doc(uid).collection('friendRequests').get(),
    db.getAll(
      ...shortlist.map(([candidateUid]) =>
        db.collection('users').doc(candidateUid).collection('friendRequests').doc(uid),
      ),
    ),
  ]);
  const incomingFrom = new Set(incomingSnap.docs.map((d) => d.id));
  const hasOutgoing = new Set(
    outgoingSnaps.filter((s) => s.exists).map((s) => s.ref.parent.parent.id),
  );

  const finalists = shortlist
    .filter(([candidateUid]) => !incomingFrom.has(candidateUid) && !hasOutgoing.has(candidateUid))
    .slice(0, MAX_SUGGESTIONS);
  if (finalists.length === 0) return { suggestions: [] };

  // The only profile data that comes back is what the account already
  // publishes to users/{uid}/public/summary — the same document a
  // friend's profile view reads, under the same bare signedIn() read rule
  // (firestore.rules). Being suggested to someone therefore discloses
  // nothing that was not already readable by any signed-in user who knew
  // the uid; this function just saves them having to know it.
  //
  // An account with no summary yet (never logged a workout) is dropped
  // rather than rendered as a nameless card.
  const summarySnaps = await db.getAll(
    ...finalists.map(([candidateUid]) =>
      db.collection('users').doc(candidateUid).collection('public').doc('summary'),
    ),
  );

  const suggestions = [];
  finalists.forEach(([candidateUid, { count, via }], i) => {
    const summary = summarySnaps[i];
    if (!summary.exists) return;
    const data = summary.data();
    suggestions.push({
      uid: candidateUid,
      // Deliberately field-by-field, not a spread of `data`. public/summary
      // will grow, and the next field added to it should have to be named
      // here before it reaches a stranger's screen.
      displayName: data.displayName ?? 'Someone',
      lifetimeVolume: data.lifetimeVolume ?? 0,
      equippedAccessories: data.equippedAccessories ?? null,
      equippedAccessory: data.equippedAccessory ?? null,
      currentStreak: data.currentStreak ?? 0,
      // Named here like every other field, per the note above. Already
      // derived when the summary was written (functions/mascots.js), so
      // this passes the id straight through and never sees the `gender`
      // it may have come from.
      mascot: data.mascot ?? null,
      mutualCount: count,
      mutualNames: via,
    });
  });

  return { suggestions };
});
