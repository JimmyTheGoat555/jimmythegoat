// Sending a friend a nudge — a pre-written, funny/edgy push to get them
// back in the gym. This function does exactly one thing: validate the
// request and write the notification doc into the target's inbox. It does
// NOT call FCM itself — see functions/index.js's sendPushOnNotificationCreate,
// the app's one and only place that calls the Messaging Admin SDK (its own
// header comment: "so a new notification type never needs new server
// code"). That trigger is also where the "first nudge pushes, later ones
// queue silently" suppression logic lives, keyed off `hasUnreadNudgePush`.
// Splitting that logic into two functions would risk a double-send (or a
// missed suppression) if the two ever drifted out of sync — one function
// owning "should this push" is the only way to keep that a single source
// of truth.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { NUDGE_MESSAGES_BY_ID } = require('./nudgeMessages');
const { assertNotBlockedBy, enforceRateLimit } = require('./guards');

exports.sendFriendNudge = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  // Writes into someone else's inbox — verified email + rate limit, see guards.js.
  const uid = request.auth.uid;
  const targetUid = request.data?.targetUid;
  const messageId = request.data?.messageId;

  if (typeof targetUid !== 'string' || !targetUid) {
    throw new HttpsError('invalid-argument', 'Missing targetUid.');
  }
  if (targetUid === uid) throw new HttpsError('invalid-argument', "You can't nudge yourself.");

  const message = NUDGE_MESSAGES_BY_ID.get(messageId);
  if (!message) throw new HttpsError('invalid-argument', 'Unknown nudge message.');

  const db = getFirestore();
  const callerSnap = await db.collection('users').doc(uid).get();
  if (!callerSnap.exists) {
    throw new HttpsError('failed-precondition', "Your profile doc doesn't exist yet — try again in a moment.");
  }

  // Checked against the CALLER's own `friends` array only, not both sides
  // — friendship is always written symmetrically in one transaction (see
  // social.js's respondToFriendRequest/removeFriend), so this one read is
  // already proof of a mutual connection, not just a one-sided claim.
  const callerFriends = callerSnap.data().friends ?? [];
  if (!callerFriends.includes(targetUid)) {
    throw new HttpsError('permission-denied', "You're not friends with that person.");
  }

  const targetRef = db.collection('users').doc(targetUid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) throw new HttpsError('not-found', "That friend's account doesn't exist anymore.");
  // Before the rate limit is spent: a blocked sender should not burn the
  // recipient's cooldown slot either.
  assertNotBlockedBy(targetSnap, uid);

  // Consumed only now that everything cheap has passed — a rejected
  // non-friend call shouldn't burn the caller's hourly budget. Throws
  // 'resource-exhausted' on the per-friend cooldown or the global cap.
  await enforceRateLimit(uid, 'nudge', targetUid);

  const fromName = callerSnap.data().displayName ?? 'A friend';
  // Always written, regardless of whether this one actually pushes — the
  // in-app inbox is never suppressed, only the OS-level push is (see
  // sendPushOnNotificationCreate).
  await targetRef.collection('notifications').add({
    type: 'friend_nudge',
    title: `${fromName} nudged you 🐐`,
    body: message.text,
    data: { fromUid: uid, fromName },
    read: false,
    createdAt: new Date().toISOString(),
  });

  return { sent: true };
});
