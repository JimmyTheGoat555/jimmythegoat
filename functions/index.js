// Cloud Functions for Jimmy the Goat.
//
// Push notifications (this file) plus the coin economy (economy.js) are
// the only server-side code this app has — everything else (trainer
// weigh-in updates, achievement detection) happens client-side as plain
// Firestore writes; see src/hooks/useNotifications.js. Each thing that
// lives here does so because a client genuinely cannot do it on its own:
//   1. Only server code holding the Admin SDK can call FCM to push to
//      someone else's device.
//   2. A reminder that must fire at a fixed time regardless of whether
//      anyone has the app open needs to run on a schedule somewhere that
//      isn't a browser tab.
//   3. Granting coins (economy.js) has to happen somewhere the client
//      can't just skip past — see that file for why validating a workout
//      client-side is a UX nicety, never the actual security boundary.
//   4. A mutual friendship (social.js) always touches TWO people's docs
//      at once — something no client write can ever do on its own, since
//      Firestore rules only ever authorize a write against the caller's
//      own uid.
//
// Deploy with `firebase deploy --only functions` (needs the project on the
// Blaze plan — Cloud Scheduler, which the weekly reminder depends on, isn't
// available on the free Spark plan).

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();

const { logWorkout, purchaseItem } = require('./economy');
exports.logWorkout = logWorkout;
exports.purchaseItem = purchaseItem;

const { deleteAccount } = require('./account');
exports.deleteAccount = deleteAccount;

const { disconnectTrainer, notifyTrainer } = require('./coaching');
exports.disconnectTrainer = disconnectTrainer;
exports.notifyTrainer = notifyTrainer;

const { claimReferral } = require('./referral');
exports.claimReferral = claimReferral;

const { completeOnboardingProfile } = require('./onboarding');
exports.completeOnboardingProfile = completeOnboardingProfile;

const { setSharePRs } = require('./publicProfile');
exports.setSharePRs = setSharePRs;

const { sendFriendRequest, respondToFriendRequest, removeFriend } = require('./social');
exports.sendFriendRequest = sendFriendRequest;
exports.respondToFriendRequest = respondToFriendRequest;
exports.removeFriend = removeFriend;

const { sendFriendNudge } = require('./nudges');
exports.sendFriendNudge = sendFriendNudge;

// Turns any newly-written notification doc into a real push, looking up
// every device token the recipient has registered (a user can have more
// than one — phone + desktop, say). This is the ONLY function that calls
// the FCM Admin SDK — every notification type (trainer weigh-in updates,
// weekly reminders below, anything added later) just writes a plain
// Firestore doc to users/{uid}/notifications and this picks it up, so a
// new notification type never needs new server code.
exports.sendPushOnNotificationCreate = onDocumentCreated(
  'users/{uid}/notifications/{notificationId}',
  async (event) => {
    const { uid } = event.params;
    const notification = event.data.data();
    const userRef = db.collection('users').doc(uid);

    // Social nudges (functions/nudges.js) get a different push rule than
    // every other notification type: the first one queued while this
    // person hasn't opened the app pushes for real; any more before they
    // do are written to the inbox above (already done, by the time this
    // runs) but skip the OS push entirely. hasUnreadNudgePush resets to
    // false the moment they actually open/foreground the app — see
    // useAuth.js — which is what makes the next nudge eligible again.
    // Every other type (trainer weigh-in updates, weekly reminders) keeps
    // pushing unconditionally; this suppression is deliberately scoped to
    // nudges only, not a general "already has an unread thing" rule.
    if (notification.type === 'friend_nudge') {
      const userSnap = await userRef.get();
      if (userSnap.data()?.hasUnreadNudgePush === true) return;
    }

    const tokensSnap = await userRef.collection('fcmTokens').get();
    if (tokensSnap.empty) return;
    const tokens = tokensSnap.docs.map((d) => d.id);

    // Set only once we know a push is actually about to be attempted —
    // marking "has an unread push" when there was nothing to send to
    // would suppress a real future nudge for no reason.
    if (notification.type === 'friend_nudge') {
      await userRef.update({ hasUnreadNudgePush: true });
    }

    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: notification.title, body: notification.body },
      webpush: { fcmOptions: { link: '/' } },
    });

    // Prune tokens FCM says are dead (uninstalled PWA, revoked permission,
    // browser data cleared) instead of retrying them forever.
    const deletions = [];
    response.responses.forEach((res, i) => {
      const code = res.error?.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') {
        deletions.push(userRef.collection('fcmTokens').doc(tokens[i]).delete());
      }
    });
    await Promise.all(deletions);
  },
);

// Runs once a day. For every user with a weekly weigh-in day set, writes a
// reminder notification the day before AND the morning of — writing to
// their OWN notifications collection (not sending push directly) so it
// shows up in-app immediately and rides the same push pipeline above,
// rather than duplicating "turn this into a push" logic here too.
//
// Iterates every user doc once a day — genuinely fine at this app's scale;
// worth revisiting (e.g. a denormalized "usersByWeighInDay" collection) if
// the user base ever gets large enough for a daily full collection scan to
// matter.
exports.weeklyWeighInReminders = onSchedule('every day 08:00', async () => {
  const today = new Date().getDay();
  const tomorrow = (today + 1) % 7;

  const usersSnap = await db.collection('users').get();

  await Promise.all(
    usersSnap.docs.map(async (userDoc) => {
      const uid = userDoc.id;
      const profileSnap = await db.doc(`users/${uid}/meta/profile`).get();
      const weighInDay = profileSnap.data()?.weighInDay;
      if (weighInDay === undefined || weighInDay === null || weighInDay === '') return;
      const day = Number(weighInDay);

      if (day === tomorrow) {
        await db.collection('users').doc(uid).collection('notifications').add({
          type: 'weigh_in_reminder_tomorrow',
          title: 'Weigh-in tomorrow 📅',
          body: "Don't forget to step on the scale tomorrow and log it.",
          read: false,
          createdAt: new Date().toISOString(),
        });
      } else if (day === today) {
        await db.collection('users').doc(uid).collection('notifications').add({
          type: 'weigh_in_reminder_today',
          title: 'Weigh-in day! ⚖️',
          body: 'Log your weight this morning to keep your streak going.',
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    }),
  );
});

// Re-engagement tease. Once a day, finds every account whose last workout
// was 3-4 days ago and drops Jimmy's "lazy goat" callout in their inbox —
// which sendPushOnNotificationCreate above then turns into a real push,
// same as every other notification type. Deliberately NOT a direct
// getMessaging() call here: that function is the app's single FCM caller
// on purpose (it owns dead-token pruning and the inbox write in one
// place), and a second hand-rolled sender would be exactly the "new
// notification type needs new server code" this file's header rules out.
//
// The 72h..96h window is what makes it fire EXACTLY ONCE per dry spell:
// the job runs daily, the window is 24h wide, so a given account crosses
// it on precisely one run — day 3. Day 2 is too soon, day 5 is already
// past it. (If Cloud Scheduler ever skips a day, that run's cohort ages
// out un-teased rather than getting double-hit later — an acceptable miss
// for a tease.) `lastWorkoutAt` is the ISO string economy.js mirrors onto
// the user doc; ISO 8601 UTC sorts lexicographically in time order, so
// string bounds are a valid range. A plain single-field range query =
// Firestore's automatic index, no firestore.indexes.json entry needed.
//
// Existing accounts that last trained before this field started being
// written simply won't match until their next logged workout — no
// deploy-day blast of every dormant user, which is the safer default.
const LAZY_WINDOW_START_MS = 96 * 60 * 60 * 1000; // 4 days ago
const LAZY_WINDOW_END_MS = 72 * 60 * 60 * 1000; // 3 days ago

exports.teaseLazyGoats = onSchedule('every day 10:00', async () => {
  const now = Date.now();
  const startIso = new Date(now - LAZY_WINDOW_START_MS).toISOString();
  const endIso = new Date(now - LAZY_WINDOW_END_MS).toISOString();

  const lazySnap = await db
    .collection('users')
    .where('lastWorkoutAt', '>=', startIso)
    .where('lastWorkoutAt', '<', endIso)
    .get();

  if (lazySnap.empty) return;

  await Promise.all(
    lazySnap.docs.map((userDoc) =>
      db.collection('users').doc(userDoc.id).collection('notifications').add({
        type: 'lazy_goat_tease',
        title: 'Jimmy is judging you. 🐐',
        body: '3 days without lifting? You are officially a lazy goat. Get off the couch and go train!',
        read: false,
        createdAt: new Date().toISOString(),
      }),
    ),
  );
});
