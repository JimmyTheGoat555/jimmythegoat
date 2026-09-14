// Keeping the name FRIENDS see in step with the name you changed.
//
// THE BUG THIS FIXES. Renaming yourself writes users/{uid}.displayName,
// which is the copy YOUR app reads — so the change looks instant to you
// and to nobody else. Everyone else reads users/{uid}/public/summary,
// whose displayName is written by logWorkout and was left pointing at the
// old name until the next workout. Reported as "I changed my username and
// it didn't change", which is exactly right from the outside.
//
// WHY A CALLABLE RATHER THAN JUST WIDENING THE RULE. The obvious fix is
// to add displayName to public/summary's owner-update allowlist and let
// the client mirror it. That would work and it would quietly gut the
// one-change-per-account limit: users/{uid} polices renames through
// usernameChangeValid(), the summary copy would police nothing, and the
// name every other person actually sees is the one that stopped being
// limited. So the mirror happens on the Admin SDK, reading the name from
// the document the rules DO police.
//
// Also not a trigger on users/{uid}: that document is written on every
// workout, purchase and equip, and a rename is a handful of events in an
// account's life. A callable fires when the thing actually happens.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');

exports.syncPublicDisplayName = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;

  const db = getFirestore();
  const userSnap = await db.collection('users').doc(uid).get();
  const displayName = userSnap.data()?.displayName;
  if (typeof displayName !== 'string' || !displayName.trim()) {
    throw new HttpsError('failed-precondition', 'No display name on your profile yet.');
  }

  const writes = [];

  // The friend-visible surface. Updated only if it already exists —
  // creating one here would give an account that has never trained a
  // public profile containing nothing but a name, which is not what the
  // absence of that document is meant to mean (see PublicFriendProfile's
  // hasSummary branch).
  const summaryRef = db.collection('users').doc(uid).collection('public').doc('summary');
  if ((await summaryRef.get()).exists) {
    writes.push(summaryRef.update({ displayName }));
  }

  // The lookup table a friends list resolves names through. useAuth's
  // self-heal effect already keeps this current, so this is belt and
  // braces — and it costs one write on an action that happens once.
  const friendCode = userSnap.data()?.friendCode;
  if (typeof friendCode === 'string' && friendCode) {
    writes.push(db.collection('friendCodes').doc(friendCode).set({ displayName, uid }, { merge: true }));
  }

  await Promise.all(writes);
  return { displayName, surfaces: writes.length };
});
