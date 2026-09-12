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
const { enforceRateLimit } = require('./guards');

// A trainee's client calls this after logging a weigh-in so their
// connected trainer gets an inbox notification (which
// sendPushOnNotificationCreate turns into a push). It replaces a direct
// client write into the trainer's notifications subcollection — that path
// let any account point its own `trainerId` at a victim and post
// arbitrary title/body text. Here the text is built server-side from
// numbers + the caller's OWN verified displayName, so the worst a caller
// can do is send a real-looking weigh-in update to a trainer they've
// actually connected to, rate-limited on top.
exports.notifyTrainer = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;

  const weight = Number(request.data?.weight);
  if (!Number.isFinite(weight) || weight < 20 || weight > 500) {
    throw new HttpsError('invalid-argument', 'Weight out of range.');
  }
  const deltaRaw = request.data?.deltaKg;
  const deltaKg = deltaRaw == null ? null : Number(deltaRaw);
  if (deltaKg !== null && (!Number.isFinite(deltaKg) || Math.abs(deltaKg) > 100)) {
    throw new HttpsError('invalid-argument', 'Delta out of range.');
  }
  const achieved = request.data?.achieved === true;

  const db = getFirestore();
  const callerSnap = await db.collection('users').doc(uid).get();
  if (!callerSnap.exists) throw new HttpsError('failed-precondition', 'Profile not ready yet.');
  const caller = callerSnap.data();
  const trainerId = caller.trainerId ?? null;
  if (!trainerId) return { sent: false, reason: 'no-trainer' };

  const trainerSnap = await db.collection('users').doc(trainerId).get();
  if (!trainerSnap.exists || trainerSnap.data().role !== 'trainer') {
    return { sent: false, reason: 'trainer-gone' };
  }

  await enforceRateLimit(uid, 'weighInNotify');

  const name = typeof caller.displayName === 'string' ? caller.displayName.slice(0, 60) : 'Your trainee';
  const w = Math.round(weight * 10) / 10;
  const amount = deltaKg != null ? `${Math.abs(Math.round(deltaKg * 10) / 10)} kg` : null;
  const direction = deltaKg > 0 ? 'up' : deltaKg < 0 ? 'down' : null;
  const body = achieved
    ? `Progress toward their goal: ${amount} ${direction}. Now ${w} kg.`
    : amount && direction
      ? `${w} kg (${amount} ${direction} from last time).`
      : `First weigh-in logged: ${w} kg.`;

  await db.collection('users').doc(trainerId).collection('notifications').add({
    type: 'trainee_weigh_in',
    title: `${name} logged a weigh-in`,
    body,
    data: { traineeId: uid },
    read: false,
    createdAt: new Date().toISOString(),
  });

  return { sent: true };
});

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
