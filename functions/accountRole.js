// Switching an account between coaching and being coached — the one
// profile field firestore.rules never lets the owner write.
//
// `role` is trusted by the server: logWorkout floors a trainer's tier at
// Buff (minStage 2, functions/economy.js), and the client shows a coach
// the Trainees tab and their coach code on nothing but this string. A
// client write would let any account hand itself the floor, so the switch
// is minted here, where it can also do the housekeeping that makes it
// safe to flip:
//
//   * becoming a trainer mints (or restores) a coach code and its
//     trainerCodes/{code} lookup entry, and ends any link to a coach of
//     their own — a coach is not coached, and the app never offers a
//     trainer the "connect to a coach" path;
//   * stepping down releases every trainee — their trainerId cleared and
//     this coach's assignments removed, the same severing disconnectTrainer
//     does for one, done for all — and retires the lookup entry, so a code
//     that now resolves to a non-coach cannot connect anyone. The code
//     itself stays on the doc: coming back restores the same one, and a
//     returning trainee can use the code they already have.
//
// The public summary's minStage is rewritten as well — it is what
// friends' devices draw the tier with (leaderboard, profile) — rather
// than waiting for the next workout to refresh it.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { enforceRateLimit } = require('./guards');

const ROLES = new Set(['trainer', 'trainee']);
// Twin of src/utils/evolutionTiers.js's TRAINER_MIN_STAGE, and of the
// literal economy.js writes into the summary on every workout.
const TRAINER_MIN_STAGE = 2;
// Firestore allows 500 writes per batch; a coach stepping down with many
// trainees and many assignments can pass that, so writes go out in
// slices. Not atomic across slices — the caller's own doc is written
// LAST, so a failure part-way leaves the role unchanged and a retry
// finishes the cleanup rather than finding it half-done.
const BATCH_LIMIT = 400;

// Twin of hooks/useAuth.js's randomShareCode.
function randomShareCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function commitAll(db, ops) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch);
    await batch.commit();
  }
}

exports.setAccountRole = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const role = request.data?.role;
  if (!ROLES.has(role)) throw new HttpsError('invalid-argument', 'Role must be "trainer" or "trainee".');
  await enforceRateLimit(uid, 'roleSwitch');

  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'No account to update.');
  const data = snap.data();
  const current = data.role === 'trainer' ? 'trainer' : 'trainee';
  let code = typeof data.trainerCode === 'string' && data.trainerCode ? data.trainerCode : null;
  if (current === role) {
    return {
      role,
      changed: false,
      trainerCode: role === 'trainer' ? code : null,
      traineesReleased: 0,
      assignmentsRemoved: 0,
    };
  }

  const ops = [];
  let assignmentsRemoved = 0;
  let traineesReleased = 0;

  if (role === 'trainer') {
    if (!code) code = randomShareCode();
    const codeRef = db.collection('trainerCodes').doc(code);
    ops.push((batch) => batch.set(codeRef, { trainerId: uid }, { merge: true }));
    const coachId = typeof data.trainerId === 'string' && data.trainerId ? data.trainerId : null;
    if (coachId) {
      const assignments = await userRef.collection('assignedWorkouts').where('assignedBy', '==', coachId).get();
      for (const doc of assignments.docs) ops.push((batch) => batch.delete(doc.ref));
      assignmentsRemoved += assignments.size;
    }
  } else {
    const trainees = await db.collection('users').where('trainerId', '==', uid).get();
    for (const trainee of trainees.docs) {
      const assignments = await trainee.ref.collection('assignedWorkouts').where('assignedBy', '==', uid).get();
      for (const doc of assignments.docs) ops.push((batch) => batch.delete(doc.ref));
      assignmentsRemoved += assignments.size;
      ops.push((batch) => batch.update(trainee.ref, { trainerId: null }));
      traineesReleased += 1;
    }
    if (code) {
      const codeRef = db.collection('trainerCodes').doc(code);
      ops.push((batch) => batch.delete(codeRef));
    }
  }

  const summaryRef = userRef.collection('public').doc('summary');
  if ((await summaryRef.get()).exists) {
    ops.push((batch) => batch.update(summaryRef, { minStage: role === 'trainer' ? TRAINER_MIN_STAGE : 1 }));
  }

  // Last, on purpose — see BATCH_LIMIT.
  ops.push((batch) =>
    batch.update(userRef, {
      role,
      roleChangedAt: FieldValue.serverTimestamp(),
      ...(role === 'trainer' ? { trainerCode: code, trainerId: null } : {}),
    }),
  );

  await commitAll(db, ops);
  return { role, changed: true, trainerCode: role === 'trainer' ? code : null, traineesReleased, assignmentsRemoved };
});
