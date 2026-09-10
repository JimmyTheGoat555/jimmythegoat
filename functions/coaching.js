// Ending a trainer/trainee relationship.
//
// Connecting is a plain client write — a trainee sets their own trainerId
// from a code. Disconnecting cannot be, for two reasons:
//
//   1. A trainer removing a trainee has to write the TRAINEE's document,
//      which firestore.rules never allows (users/{uid} is owner-write only).
//   2. Either side ending it should also clear the assignments that trainer
//      pushed. Those are readable by whoever created them
//      (assignedWorkouts' `assignedBy` rule), so leaving them behind would
//      let an ex-coach keep watching a former trainee tick workouts off
//      long after the relationship ended. Severing access is the point of
//      disconnecting, so it has to include those — and only the assigning
//      trainer may delete them, which a departing trainee is not.
//
// So both directions go through here, where the Admin SDK can do the whole
// thing atomically regardless of which side asked.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');

exports.disconnectTrainer = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const callerUid = request.auth.uid;
  const traineeUid = request.data?.traineeUid ?? callerUid;
  if (typeof traineeUid !== 'string' || !traineeUid) {
    throw new HttpsError('invalid-argument', 'Missing traineeUid.');
  }

  const db = getFirestore();
  const traineeRef = db.collection('users').doc(traineeUid);
  const traineeSnap = await traineeRef.get();
  if (!traineeSnap.exists) throw new HttpsError('not-found', 'No such account.');

  const trainerId = traineeSnap.data().trainerId ?? null;
  if (!trainerId) return { disconnected: false, reason: 'not-connected' };

  // The only two people entitled to end this: the trainee, and the trainer
  // they are actually connected to. Checked against stored state rather
  // than anything the caller sent, so passing someone else's uid does
  // nothing for you unless you are already their coach.
  if (callerUid !== traineeUid && callerUid !== trainerId) {
    throw new HttpsError('permission-denied', 'Not your trainee.');
  }

  const assignments = await traineeRef
    .collection('assignedWorkouts')
    .where('assignedBy', '==', trainerId)
    .get();

  const batch = db.batch();
  batch.update(traineeRef, { trainerId: null });
  for (const doc of assignments.docs) batch.delete(doc.ref);
  await batch.commit();

  return { disconnected: true, assignmentsRemoved: assignments.size };
});
