// Taking a friend up on a workout they sent you.
//
// This used to be three plain client writes (copy the routine into your
// own templates, delete the inbox item, delete the bell row) and it worked
// fine — right up until finishing a recommended workout started paying the
// SENDER a coin bounty (see economy.js). The moment money is attached to
// "where did this routine come from", provenance stops being a display
// detail and becomes the thing an attacker edits.
//
// So the copy happens here, on the Admin SDK, and it writes TWO documents:
//
//   users/{uid}/templates/{new}      — the routine itself. Ordinary, and
//                                      client-writable like every other
//                                      template. `originatingSenderUid`
//                                      lives here for display only.
//   users/{uid}/recommendedBy/{new}  — the same id, server-only, no client
//                                      write path at all (firestore.rules).
//                                      THIS is what logWorkout trusts.
//
// Keyed by the new template's id, which buys the two properties that
// matter: the bounty pays the person the SERVER recorded (never a uid the
// client names), and it pays exactly once per accepted recommendation
// (`bountyPaidAt`), so re-running the same routine every week does not
// mint a friend 50 coins a session.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');

const MAX_EXERCISES = 30;
const MAX_TITLE = 60;

exports.acceptRecommendation = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const itemId = String(request.data?.itemId ?? '').trim();
  if (!itemId) throw new HttpsError('invalid-argument', 'Missing itemId.');

  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);
  const inboxRef = userRef.collection('inbox').doc(itemId);
  const snap = await inboxRef.get();

  // Reading the item from the inbox rather than taking a routine off the
  // request is the whole point: the payload was written by
  // recommendWorkout, so the sender's identity is already established and
  // cannot be restated by the client here.
  if (!snap.exists) throw new HttpsError('not-found', 'That recommendation is no longer in your inbox.');
  const item = snap.data();
  if (item.type !== 'workout_recommendation') {
    throw new HttpsError('failed-precondition', 'That inbox item is not a workout recommendation.');
  }

  const routine = item.templateData ?? {};
  // Rebuilt key by key, same allowlist discipline as the send side. The
  // payload was written by a trusted path, but a document that has sat in
  // a database gets re-validated on the way out on principle.
  const exercises = (Array.isArray(routine.exercises) ? routine.exercises : [])
    .slice(0, MAX_EXERCISES)
    .filter((e) => e && typeof e.exerciseId === 'string')
    .map((e) => ({
      exerciseId: e.exerciseId,
      name: typeof e.name === 'string' ? e.name.slice(0, 60) : 'Exercise',
      muscleGroup: typeof e.muscleGroup === 'string' ? e.muscleGroup : null,
    }));
  if (exercises.length === 0) {
    throw new HttpsError('failed-precondition', 'That recommendation has no exercises in it.');
  }

  const senderUid = typeof item.senderUid === 'string' ? item.senderUid : null;
  const senderName = typeof item.senderName === 'string' ? item.senderName : 'A friend';
  const templateRef = userRef.collection('templates').doc();
  const nowIso = new Date().toISOString();

  const batch = db.batch();
  batch.set(templateRef, {
    // Attributed in the title, the same convention copying a routine off a
    // friend's profile uses — a library of anonymous "Push Day"s is
    // useless a month later.
    title: `${senderName}'s ${routine.title ?? 'Workout'}`.slice(0, MAX_TITLE),
    exercises,
    // Never inherited from the sender. Accepting a routine is not
    // publishing it on your own profile; that stays its own opt-in.
    isPublic: false,
    // Display only, and deliberately duplicated rather than referenced:
    // this document is client-writable (templates always have been), so
    // nothing that pays out may read provenance from here. The copy in
    // recommendedBy/{id} is the one with authority.
    originatingSenderUid: senderUid,
    originatingSenderName: senderName,
    createdAt: nowIso,
  });

  if (senderUid && senderUid !== uid) {
    batch.set(userRef.collection('recommendedBy').doc(templateRef.id), {
      senderUid,
      senderName,
      templateTitle: routine.title ?? 'Workout',
      acceptedAt: nowIso,
      // Flipped to an ISO string by logWorkout the first time a workout
      // built from this template is logged. One bounty per acceptance.
      bountyPaidAt: null,
    });
  }

  batch.delete(inboxRef);
  // The bell row that announced it. Best-effort by nature — deleting a
  // document that is already gone is a no-op in a batch, so a recipient
  // who dismissed the notification by hand does not break their own
  // accept.
  if (typeof item.notificationId === 'string' && item.notificationId) {
    batch.delete(userRef.collection('notifications').doc(item.notificationId));
  }

  await batch.commit();
  return { templateId: templateRef.id };
});
