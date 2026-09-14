// Keeping the name FRIENDS see in step with the name you changed.
//
// THE BUG THIS FIXES. Renaming yourself writes users/{uid}.displayName,
// which is the copy YOUR app reads — so the change looks instant to you
// and to nobody else. Your name is COPIED onto three other surfaces at
// the moment things happen, and a rename reached none of them:
//
//   users/{uid}/public/summary   what a friend's profile view reads
//   friendCodes/{code}           what a friends LIST resolves names through
//   feedPosts/{id}.userName      stamped on every workout you ever logged,
//                                and therefore what the feed shows AND what
//                                the leaderboard aggregates its rows from
//
// The friend-code copy self-heals (useAuth), which is why the reported
// symptom was so specific: "it updates on the friends list and stays Big
// Reef everywhere else".
//
// WHY THE FEED POSTS GET REWRITTEN AND THE COSMETICS DO NOT. A feed post
// deliberately snapshots what you were WEARING when you logged it — see
// logWorkout — so an old card shows the goat you actually were that day.
// A name is not in that category. It is identity, not a costume: nobody
// looking at last week's workout wants to be told it was done by somebody
// who no longer exists. So the name is brought forward and the gear is
// left alone.
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

  // Every workout this account has ever posted. Bounded by how much
  // somebody has trained rather than by how many users exist, and paid
  // once per rename — which the rules cap at one per account anyway
  // (firestore.rules' usernameChangeValid).
  const posts = await db.collection('feedPosts').where('userId', '==', uid).get();
  const stale = posts.docs.filter((d) => d.data().userName !== displayName);
  const BATCH = 400;
  for (let i = 0; i < stale.length; i += BATCH) {
    const batch = db.batch();
    for (const post of stale.slice(i, i + BATCH)) batch.update(post.ref, { userName: displayName });
    await batch.commit();
  }

  return { displayName, surfaces: writes.length, postsRenamed: stale.length };
});
