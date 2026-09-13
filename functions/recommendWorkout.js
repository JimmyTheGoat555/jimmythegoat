// "Try this one." Sending a saved routine straight into a friend's inbox.
//
// Structurally this is a cousin of nudges.js — validate, prove the
// friendship, write into someone else's subcollection — with one real
// difference: a nudge is a poke that lives and dies in the notification
// list, while a recommendation is an ITEM. It carries a payload, it waits
// for a decision, and it has to survive being scrolled past. That is why
// it lands in users/{uid}/inbox rather than users/{uid}/notifications:
// the notification list is capped, dismissible with a stray ✕ and
// truncated at 12 rows, all of which are fine for "Jimmy is judging you"
// and wrong for something the recipient still has to accept.
//
// It writes BOTH, though, and that is deliberate rather than sloppy:
//   * the inbox doc is the item (payload, actionable, deleted on accept);
//   * a plain notification doc is the arrival ping, and exists because
//     sendPushOnNotificationCreate (index.js) is this app's ONE FCM
//     caller. Riding that pipeline is how a recommendation becomes a real
//     push without a second hand-rolled sender — see that file's header.
// The inbox doc remembers its notification's id so accepting or declining
// clears both in one tap.
//
// WHAT THE PUSH SAYS IS NOT USER-WRITTEN. The optional `message` shows
// only inside the in-app card; the push title/body are server-templated
// from the sender's verified display name and the routine title. Free
// text that lands on a stranger's lock screen is a harassment channel,
// and it is exactly the reason nudges ship a fixed message catalogue
// (nudgeMessages.js) instead of a text box.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { enforceRateLimit } = require('./guards');

// Matches friendPrivacy.js's MAX_PUBLISHED_EXERCISES. A routine longer
// than this is a malformed payload, not a workout.
const MAX_EXERCISES = 30;
const MAX_TITLE = 60;
const MAX_MESSAGE = 140;

// Rebuilt key by key from the sender's own stored template rather than
// copied wholesale — an ALLOWLIST BY CONSTRUCTION, the same discipline
// friendPrivacy.js's publishableRoutine uses on the publish side. A field
// added to templates later (a note, a target weight, anything) cannot
// reach a friend's device by accident, because nothing here copies it.
//
// Templates are already weightless at rest (useWorkoutTemplates stores
// exerciseId/name/muscleGroup and nothing else), so today this strips
// nothing. It still strips, because that will not stay true forever.
function shareableTemplate(data) {
  const exercises = Array.isArray(data?.exercises) ? data.exercises : [];
  return {
    title: (typeof data?.title === 'string' && data.title.trim().slice(0, MAX_TITLE)) || 'Workout',
    exercises: exercises
      .slice(0, MAX_EXERCISES)
      .filter((e) => e && typeof e.exerciseId === 'string')
      .map((e) => ({
        exerciseId: e.exerciseId,
        name: typeof e.name === 'string' ? e.name.slice(0, 60) : 'Exercise',
        muscleGroup: typeof e.muscleGroup === 'string' ? e.muscleGroup : null,
      })),
  };
}

exports.recommendWorkout = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const friendUid = String(request.data?.friendUid ?? '').trim();
  const templateId = String(request.data?.templateId ?? '').trim();
  // Collapsed to single spaces before capping: a "message" made of 140
  // newlines is a card that pushes everything else off the screen.
  const message = String(request.data?.message ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE);

  if (!friendUid) throw new HttpsError('invalid-argument', 'Missing friendUid.');
  if (!templateId) throw new HttpsError('invalid-argument', 'Missing templateId.');
  if (friendUid === uid) throw new HttpsError('invalid-argument', "You can't send a workout to yourself.");

  const db = getFirestore();
  const callerRef = db.collection('users').doc(uid);
  const [callerSnap, templateSnap] = await Promise.all([
    callerRef.get(),
    callerRef.collection('templates').doc(templateId).get(),
  ]);

  if (!callerSnap.exists) {
    throw new HttpsError('failed-precondition', "Your profile doc doesn't exist yet — try again in a moment.");
  }

  // Checked against the CALLER's own `friends` array only, exactly as
  // nudges.js does and for the same reason: friendship is always written
  // symmetrically in one transaction (social.js), so this single read is
  // already proof of a mutual connection rather than a one-sided claim.
  const callerFriends = callerSnap.data().friends ?? [];
  if (!callerFriends.includes(friendUid)) {
    throw new HttpsError('permission-denied', "You're not friends with that person.");
  }

  // Read from the caller's OWN templates subcollection, which is the
  // whole point of taking a templateId instead of a payload: the routine
  // that arrives is one they actually saved, not an arbitrary blob a
  // tampered client typed into someone else's inbox.
  //
  // Note what is deliberately NOT required here: `isPublic`. That flag is
  // consent to BROADCAST a routine on your profile where every friend can
  // browse it. Handing one specific person one specific workout is its
  // own explicit act, made in this modal, and does not need the other
  // permission — nor should it quietly grant it.
  if (!templateSnap.exists) throw new HttpsError('not-found', "That routine doesn't exist any more.");
  const templateData = shareableTemplate(templateSnap.data());
  if (templateData.exercises.length === 0) {
    throw new HttpsError('failed-precondition', 'That routine has no exercises in it.');
  }

  const friendRef = db.collection('users').doc(friendUid);
  const friendSnap = await friendRef.get();
  if (!friendSnap.exists) throw new HttpsError('not-found', "That friend's account doesn't exist anymore.");

  // Consumed only once everything cheap has passed, matching nudges: a
  // rejected non-friend call should not burn the caller's budget. Throws
  // 'resource-exhausted' on the per-friend cooldown or the hourly cap.
  await enforceRateLimit(uid, 'workoutRecommendation', friendUid);

  const senderName = callerSnap.data().displayName ?? 'A friend';
  const count = templateData.exercises.length;

  // Written first so the inbox item can point at it. Body is templated,
  // never the sender's free text (see the header) — and it names the
  // routine, because "someone sent you something" is not worth unlocking
  // a phone for.
  const notification = await friendRef.collection('notifications').add({
    type: 'workout_recommendation',
    title: `${senderName} sent you a workout 📋`,
    body: `${templateData.title} · ${count} exercise${count === 1 ? '' : 's'}. Accept it from your inbox.`,
    data: { fromUid: uid, fromName: senderName },
    read: false,
    createdAt: new Date().toISOString(),
  });

  // Deterministic id — "{sender}__{template}", the same composite-key
  // convention firestore.rules already uses for cheers. Re-sending the
  // same routine to the same person therefore REPLACES the pending card
  // instead of stacking a second identical one, which is the difference
  // between a nag and a duplicate.
  await friendRef
    .collection('inbox')
    .doc(`${uid}__${templateId}`)
    .set({
      type: 'workout_recommendation',
      senderUid: uid,
      senderName,
      message,
      templateData,
      notificationId: notification.id,
      createdAt: new Date().toISOString(),
    });

  return { sent: true, to: friendSnap.data().displayName ?? null };
});
