// The app's own account — "Jimmy" — and the rule that everybody is
// friends with it.
//
// WHY EMAIL AND NOT A UID. The obvious implementation is a uid constant,
// and it would be wrong twice: the account did not exist when this was
// written (so there was no uid to paste), and a uid pasted into source is
// unreadable to the next person and silently wrong if the account is ever
// recreated. An email is the thing the owner actually knows. It is
// resolved once per warm instance and cached.
//
// WHAT THIS IS NOT. It is not an admin flag, a role, or a permission.
// Being friends with Jimmy grants exactly what being friends with anyone
// grants — your workouts appear in each other's feed and leaderboard.
// Feed posts are readable by every signed-in user anyway (see
// firestore.rules), so this changes what people SEE, not what they CAN
// see.
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { liveUidsOf } = require('./liveUsers');

const OFFICIAL_ACCOUNT_EMAIL = 'jimmythegoat.app@gmail.com';

// Cached for the life of the instance. `null` means "looked and it was
// not there" — cached too, so a cold app with no official account yet
// does not pay an Auth lookup on every single signup.
let cachedUid;

async function officialAccountUid() {
  if (cachedUid !== undefined) return cachedUid;
  try {
    const user = await getAuth().getUserByEmail(OFFICIAL_ACCOUNT_EMAIL);
    cachedUid = user.uid;
  } catch {
    // auth/user-not-found, most likely: the account has not been created
    // yet. Not an error — new signups simply get no Jimmy until it exists.
    cachedUid = null;
  }
  return cachedUid;
}

// Makes `uid` and the official account mutual friends. Idempotent
// (arrayUnion), and safe to call on every signup.
//
// BEST EFFORT, ALWAYS. Every caller runs this after the work that
// actually matters, and swallows the result: a signup that succeeded must
// never be undone because the welcome friendship did not land. The friend
// can be added later; the account cannot be un-created.
async function friendWithOfficialAccount(uid) {
  const officialUid = await officialAccountUid();
  if (!officialUid || officialUid === uid) return false;

  const db = getFirestore();
  const officialRef = db.collection('users').doc(officialUid);
  // If the official account's own user doc has not been created yet
  // (signed up in Auth but never finished onboarding), writing to it here
  // would create a half-formed document with nothing but a friends array.
  if (!(await officialRef.get()).exists) return false;

  // Both sides in one batch, because a half-applied friendship is the one
  // state nothing in this app knows how to read: social.js is built on
  // the invariant that `friends` is symmetric, and the nudge and
  // recommendation callables prove a connection by checking ONE side.
  const batch = db.batch();
  batch.update(db.collection('users').doc(uid), { friends: FieldValue.arrayUnion(officialUid) });
  batch.update(officialRef, { friends: FieldValue.arrayUnion(uid) });
  await batch.commit();
  return true;
}

module.exports = { OFFICIAL_ACCOUNT_EMAIL, officialAccountUid, friendWithOfficialAccount };

// ── Backfill ─────────────────────────────────────────────────────────────
//
// "Every user is a friend of Jimmy" has to be true of the accounts that
// already existed when the rule was made, not just the ones created after
// it. This is the one-time sweep for those, and it is a callable rather
// than a script because there is no admin tooling on this project and no
// service-account key lying around — the owner runs it from their own
// signed-in session.
//
// AUTHORISATION IS IDENTITY, NOT A SECRET: only the official account
// itself may run it, checked against the same email lookup everything
// else here uses. No token to leak, and nothing to rotate.
//
// Idempotent, so running it twice is free.
async function backfillOfficialFriendships(callerUid) {
  const officialUid = await officialAccountUid();
  if (!officialUid) return { ran: false, reason: 'no-official-account' };
  if (callerUid !== officialUid) return { ran: false, reason: 'not-official-account' };

  const db = getFirestore();
  const officialRef = db.collection('users').doc(officialUid);
  // Same guard friendWithOfficialAccount has, for the same reason: an
  // update() against a document that does not exist throws, and Jimmy
  // signed up in Auth without finishing onboarding is a real state.
  if (!(await officialRef.get()).exists) return { ran: false, reason: 'no-official-account' };

  const users = await db.collection('users').get();
  const candidates = users.docs.map((d) => d.id).filter((id) => id !== officialUid);

  // ── ORPHANS ARE SKIPPED ────────────────────────────────────────────
  //
  // `users` is the wrong list to trust on its own. A console deletion
  // removes the Auth record and leaves users/{uid} behind (see
  // liveUsers.js), and this project is mostly those: 33 of 49 documents
  // have no account. Friending Jimmy to every document would put 33 dead
  // uids into a `friends` array that live code then acts on — useFeed
  // opens a listener per 30 friends, useFriendsGraph resolves a display
  // name for each, and the friends list would show ghosts nobody can
  // remove. The write is also permanent in the direction that matters:
  // arrayUnion makes re-running this free, but it has no idea which
  // entries IT added, so there is no equally cheap way back out.
  //
  // One Auth lookup per 100 candidates buys a list that is actually true.
  const live = await liveUidsOf(candidates);
  const others = candidates.filter((id) => live.has(id));
  const skippedOrphans = candidates.length - others.length;
  if (others.length === 0) return { ran: true, friended: 0, skippedOrphans };

  // Their side, one write each, batched.
  const CHUNK = 400;
  for (let i = 0; i < others.length; i += CHUNK) {
    const batch = db.batch();
    for (const id of others.slice(i, i + CHUNK)) {
      batch.update(db.collection('users').doc(id), { friends: FieldValue.arrayUnion(officialUid) });
    }
    await batch.commit();
  }

  // Jimmy's side. This used to be a single arrayUnion spreading every uid
  // as an argument, which is fine at tens of users and is a trap at tens
  // of thousands: one document has a 1 MB ceiling and one call would carry
  // the whole roster. Chunked, so the ceiling is approached by a document
  // that is genuinely too big rather than by one oversized request —
  // and if it is ever reached, the fix is a different shape for `friends`
  // entirely, not a bigger write.
  for (let i = 0; i < others.length; i += CHUNK) {
    await officialRef.update({ friends: FieldValue.arrayUnion(...others.slice(i, i + CHUNK)) });
  }

  return { ran: true, friended: others.length, skippedOrphans };
}

module.exports.backfillOfficialFriendships = backfillOfficialFriendships;
