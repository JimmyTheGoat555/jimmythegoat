// Self-service account deletion.
//
// This has to be server-side for the same reason mutual friendship does:
// erasing an account touches documents that belong to OTHER people (their
// friends arrays, the friend requests this person sent them, the cheers they
// left on other people's posts) and a client write can only ever be
// authorized against its own uid. It also has to delete the Firebase Auth
// user itself, which only the Admin SDK can do.
//
// It backs the promise made in content/legalContent.js: "you can delete your
// account and everything in it". So the deletion is deliberately thorough
// rather than just dropping users/{uid} and leaving a trail of the person's
// uid and display name scattered across lookup tables and other users' docs.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue, FieldPath } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

// Firestore batches cap at 500 writes; every fan-out here is chunked so a
// popular account (lots of friends, lots of posts) can't blow the limit.
const BATCH_LIMIT = 400;

async function commitInChunks(db, refs, apply) {
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + BATCH_LIMIT)) apply(batch, ref);
    await batch.commit();
  }
}

exports.deleteAccount = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;

  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const user = userSnap.exists ? userSnap.data() : {};

  // 1. Other people's copies of this friendship. Done before the account
  //    doc goes, so if anything below fails the user is still intact rather
  //    than half-erased with dangling friend entries pointing at nothing.
  const friends = Array.isArray(user.friends) ? user.friends : [];
  await commitInChunks(
    db,
    friends.map((f) => db.collection('users').doc(f)),
    (batch, ref) => batch.update(ref, { friends: FieldValue.arrayRemove(uid) }),
  );

  // 2. Friend requests this person sent to others (their doc, not ours) and
  //    cheers they left on other people's posts. Both live under someone
  //    else's document, so they are found by collection-group query — see
  //    firestore.indexes.json for the field indexes these need.
  const [sentRequests, likes] = await Promise.all([
    db.collectionGroup('friendRequests').where('fromUid', '==', uid).get(),
    db.collectionGroup('likes').where('likerUid', '==', uid).get(),
  ]);
  await commitInChunks(
    db,
    [...sentRequests.docs, ...likes.docs].map((d) => d.ref),
    (batch, ref) => batch.delete(ref),
  );

  // 3. Cheers other people left on THEIR published items (PRs, routines).
  //    Step 2 removes cheers this person LEFT; these are the mirror image
  //    and would otherwise outlive the account. `cheers` doc ids are
  //    "{ownerUid}__{itemId}", so a documentId() range scan finds exactly
  //    this owner's targets — \uf8ff being the largest code point Firestore
  //    will sort, which makes it the standard prefix terminator.
  const ownCheerTargets = await db
    .collection('cheers')
    .where(FieldPath.documentId(), '>=', `${uid}__`)
    .where(FieldPath.documentId(), '<', `${uid}__\uf8ff`)
    .get();
  await Promise.all(ownCheerTargets.docs.map((d) => db.recursiveDelete(d.ref)));

  // 4. Their feed posts, each recursively so the cheers other people left
  //    on them go too rather than being orphaned under a deleted parent.
  const posts = await db.collection('feedPosts').where('userId', '==', uid).get();
  await Promise.all(posts.docs.map((d) => db.recursiveDelete(d.ref)));

  // 5. If they coached anyone, cut those trainees loose. Their own workout
  //    history is theirs and stays untouched; they simply stop having a
  //    coach, which is the same state they signed up in.
  if (user.role === 'trainer') {
    const trainees = await db.collection('users').where('trainerId', '==', uid).get();
    await commitInChunks(
      db,
      trainees.docs.map((d) => d.ref),
      (batch, ref) => batch.update(ref, { trainerId: null }),
    );
  }

  // 6. The share-code lookup tables (map a public code to this uid and
  //    display name — leaving them keeps the account findable and
  //    name-resolvable after it is gone) plus the top-level abuse-counter
  //    doc (rateLimits/{uid}, written by functions/guards.js). All three
  //    live OUTSIDE users/{uid}, so the recursiveDelete in step 6 doesn't
  //    reach them.
  const lookups = [db.collection('rateLimits').doc(uid)];
  if (user.friendCode) lookups.push(db.collection('friendCodes').doc(user.friendCode));
  if (user.trainerCode) lookups.push(db.collection('trainerCodes').doc(user.trainerCode));
  await commitInChunks(db, lookups, (batch, ref) => batch.delete(ref));

  // 7. The account itself: recursive, so workouts, templates, notifications,
  //    fcmTokens, assignedWorkouts, incoming friendRequests and meta/profile
  //    (body weight log, goals) all go with it.
  await db.recursiveDelete(userRef);

  // 8. Last, because it is the only step that cannot be retried: once the
  //    Auth user is gone this person can no longer sign in to call us again.
  //    Everything above is idempotent, so a failure part-way through leaves
  //    an account that can simply run the deletion a second time.
  await getAuth().deleteUser(uid);

  return { deleted: true };
});
