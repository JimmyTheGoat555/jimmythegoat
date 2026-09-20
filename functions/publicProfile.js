// The one write path for `users/{uid}/public/summary` — the small,
// deliberately-public mirror a friend's profile view reads from (see
// FriendProfile.jsx). Nothing else ever writes this document; logWorkout()
// refreshes it after every workout, and this file's setSharePRs is the only
// way the sharePRs preference itself changes.
//
// Why a callable and not a plain client write to users/{uid}.sharePRs: this
// toggle has an immediate, real privacy consequence — turning it off must
// hide already-published PRs the instant it happens, not whenever this
// person next logs a workout. A plain client write to the private flag
// would leave public/summary stale (still showing PRs after "off") until
// their next log — a real privacy leak, not just a cosmetic delay. Routing
// the toggle through here keeps the flag and its public consequence a
// single atomic operation, the same reason respondToFriendRequest and
// removeFriend are callables rather than direct client writes.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { bestWeightPerExercise, lifetimeVolumeOf, publishableRecord } = require('./records');
const { resolveMascotId } = require('./mascots');
const { progressionScaleFor } = require('./evolution');

exports.setSharePRs = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const share = Boolean(request.data?.share);

  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);
  const summaryRef = userRef.collection('public').doc('summary');

  const [userSnap, workoutsSnap] = await Promise.all([userRef.get(), userRef.collection('workouts').get()]);
  if (!userSnap.exists)
    throw new HttpsError('failed-precondition', "Your profile doc doesn't exist yet — try again in a moment.");
  const workouts = workoutsSnap.docs.map((d) => d.data());

  const summary = {
    displayName: userSnap.data().displayName ?? 'Someone',
    lifetimeVolume: Math.round(lifetimeVolumeOf(workouts)),
    sharePRs: share,
    // Refreshed here as well as in logWorkout, because this is the other
    // writer of the same document and a merge that omitted it would leave
    // a stale character behind on any account that switched mascot before
    // its next workout.
    mascot: resolveMascotId(userSnap.data()),
    // And the ladder that goes with it — see economy.js's summary write.
    progressionScale: progressionScaleFor(userSnap.data()),
  };
  // Field PRESENCE is the visibility control, not a value a reader has to
  // check — a friend's client only ever looks at whether personalRecords
  // exists on the doc. Turning sharing off deletes the field outright
  // rather than leaving stale records behind an unchecked flag.
  if (share) {
    // publishableRecord drops the absolute load for bodyweight lifts —
    // see economy.js for why. Shared from there so the two publishers of
    // this list cannot disagree about what a friend is allowed to see.
    summary.personalRecords = [...bestWeightPerExercise(workouts).entries()].map(([exerciseId, r]) =>
      publishableRecord(exerciseId, r),
    );
  }

  const batch = db.batch();
  batch.update(userRef, { sharePRs: share });
  // set() with merge:false (the default for a fresh field set here) would
  // be fine too, but merge:true plus an explicit FieldValue.delete() is
  // what actually removes `personalRecords` when turning sharing off —
  // otherwise the field would just sit there unmerged-over, stale forever.
  batch.set(summaryRef, share ? summary : { ...summary, personalRecords: FieldValue.delete() }, { merge: true });
  await batch.commit();

  return { sharePRs: share };
});
