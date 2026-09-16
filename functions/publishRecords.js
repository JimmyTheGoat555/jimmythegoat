// Applies the lifter's "which of my records do I want on the feed?" answer
// to a feed post that already exists.
//
// This callable exists because of an ordering problem the new finish flow
// created deliberately. The celebration screen is built ENTIRELY out of
// logWorkout's response — coins, badges, total volume, the authoritative
// record list, the recommendation bounty — so logWorkout has to have run
// before the celebration can render a single frame. But the whole point of
// the redesign is that nobody is asked to make choices until the
// celebration is over. The answer therefore arrives strictly after the
// write it affects, and something has to go back and amend it.
//
// The safe direction is the one taken here: logWorkout publishes NOTHING
// (`sharedRecordExerciseIds: []` from the client, see useEconomy.js), and
// this call can only ever ADD. The opposite design — publish everything
// and let this retract — would put a record a friend's live feed listener
// can already see on screen before the lifter was ever asked.
//
// Nothing here trusts the client with WHAT a record is. The caller sends
// ids; the records themselves are re-read from the workout document the
// server wrote, and firestore.rules makes that document unforgeable (a
// client write is rejected unless the result has `verified` false or
// absent, and no client can set it true — so `verified: true` and
// `unpublishedRecords` could only have been written together by the Admin
// SDK inside logWorkout).

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { publishableRecord } = require('./records');

// How long after finishing the answer is still accepted. Generous enough
// to cover a long celebration, a badge modal, a save-routine prompt and
// someone reading their phone in the changing room; short enough that this
// is not a permanent "edit any past post" endpoint, which is a different
// feature with different rules.
const PUBLISH_WINDOW_MS = 60 * 60 * 1000;

const MAX_SHARED_RECORD_IDS = 100;

exports.publishWorkoutRecords = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const { workoutId, exerciseIds } = request.data ?? {};

  if (typeof workoutId !== 'string' || !workoutId) {
    throw new HttpsError('invalid-argument', 'workoutId is required.');
  }
  // An empty array is the normal "I chose to share none of them" answer.
  // It is not an error and it is not a no-op either: it still resolves the
  // post, it just leaves it with no records — which is already its state,
  // so the function simply returns without a write.
  if (!Array.isArray(exerciseIds)) {
    throw new HttpsError('invalid-argument', 'exerciseIds must be an array.');
  }

  const db = getFirestore();
  const workoutRef = db.collection('users').doc(uid).collection('workouts').doc(workoutId);
  const snap = await workoutRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Workout not found.');

  const workout = snap.data();
  // The unforgeable marker. Without it this would happily amend a feed
  // post from a hand-written workout doc naming any records it liked.
  if (workout.verified !== true) {
    throw new HttpsError('permission-denied', 'That workout was not logged by the server.');
  }

  const finishedMs = Date.parse(workout.finishedAt);
  if (!Number.isFinite(finishedMs) || Date.now() - finishedMs > PUBLISH_WINDOW_MS) {
    throw new HttpsError('failed-precondition', 'That workout is no longer being shared.');
  }

  const feedPostId = workout.feedPostId;
  const available = Array.isArray(workout.unpublishedRecords) ? workout.unpublishedRecords : [];
  // A recovery workout writes no feed post at all, and a workout with no
  // records has nothing to add. Neither is a failure — the client asks for
  // this step off the same record list, so the honest answer is "nothing
  // to do" rather than an error it would have to special-case.
  if (typeof feedPostId !== 'string' || !feedPostId || available.length === 0) {
    return { published: 0 };
  }

  const chosen = new Set(exerciseIds.slice(0, MAX_SHARED_RECORD_IDS).filter((id) => typeof id === 'string'));
  // Filter the SERVER's list by the client's ids — never the other way
  // round. An id naming a lift that was not a record here matches nothing.
  const selected = available.filter((r) => chosen.has(r.exerciseId));
  if (selected.length === 0) return { published: 0 };

  const feedPostRef = db.collection('feedPosts').doc(feedPostId);
  const postSnap = await feedPostRef.get();
  // Belt and braces: the post is named by a document only the server
  // writes, but this is a top-level collection and the check costs one
  // read on a path that runs once per workout.
  if (!postSnap.exists || postSnap.data()?.userId !== uid) {
    throw new HttpsError('not-found', 'Feed post not found.');
  }

  // Same treatment as logWorkout: a bodyweight record goes out as BW +
  // belt, never as the absolute load (which would disclose body weight).
  await feedPostRef.update({
    personalRecords: selected.map((r) => publishableRecord(r.exerciseId, r)),
  });

  return { published: selected.length };
});
