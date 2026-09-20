import { CONTACT_EMAIL } from './legalContent';

// The Support page's copy. App Store Connect requires a support URL, and
// Apple's reviewers do open it — a page that only says "email us" is a
// common rejection. So this answers the questions people actually arrive
// with, and it answers them accurately for THIS app (see firestore.rules
// and functions/account.js for the behaviour described here). Same
// {heading, body} shape as legalContent.js so both share one renderer.

export const SUPPORT_EMAIL = CONTACT_EMAIL;

// Shown under the page title, above the sections.
export const SUPPORT_INTRO =
  'Questions, bugs, or account problems — the answers below cover most of them. Anything else, email us and a human will reply.';

// How long people should expect to wait. Say something you can keep to;
// an unanswered promise here is worse than no promise.
export const SUPPORT_RESPONSE_TIME = 'We aim to reply within 2 business days.';

export const SUPPORT_SECTIONS = [
  {
    heading: 'Delete your account',
    body: `Open Settings (the gear icon, top left) and scroll to the bottom, then tap "Delete my account" and type DELETE to confirm.

This is immediate and permanent. It erases your profile, every workout you have logged, your templates, your body-weight history, your coins and everything you bought with them, and it removes you from your friends' lists. We keep nothing afterwards, and there is no way for us to restore it — so export anything you want to keep first.`,
  },
  {
    heading: 'Forgotten password',
    body: `On the sign-in screen, enter your email and tap "Forgot password". You will get a reset link by email.

If it does not arrive within a few minutes, check your spam folder. If it still is not there, the address may not have an account on it — email us and we will check.`,
  },
  {
    heading: 'Notifications are not arriving',
    body: `Check three things, in this order:

1. iOS Settings → Jimmy the Goat → Notifications → Allow Notifications is on.
2. In the app, Settings → Notifications is switched on.
3. Focus or Do Not Disturb is not filtering them out.

Rest-timer alerts are scheduled on your device and work with the app closed. Nudges from friends and your trainer are sent from our server and need a working connection.`,
  },
  {
    heading: 'A workout did not save',
    body: `Your session is kept on your device while you log it, so closing the app mid-workout does not lose it — reopen and it will still be there.

Finishing a workout does need a connection, because the server is what awards your coins and checks your personal records. If you finish while offline, stay on the screen and try again once you have signal.`,
  },
  {
    heading: 'Friends and trainer codes',
    body: `Your friend code is in Settings and on your profile. Share it, and a friend can add you with it — friendships are mutual, so you will both see each other.

Trainers get a separate coach code. A trainee enters it once to connect, and can disconnect at any time from Settings. Trainers see their trainees' logged workouts; trainees never see other trainees.`,
  },
  {
    heading: 'Coins, the store, and ads',
    body: `Coins are earned by training, and by watching an optional rewarded ad once a day. They only buy cosmetics — outfits and accessories for your goat. Nothing in the app affects your training data or unlocks features you would otherwise pay for.

If a purchase did not appear, force-close and reopen the app first: your balance and inventory are stored on our server, so they follow your account onto any device.`,
  },
  {
    heading: 'Your data and privacy',
    body: `Your workouts, body weight and goals are private by default. You choose what to share: personal records can be posted to your friends' feed, and body weight is never shared unless you turn it on for a connected trainer.

The full detail is in our Privacy Policy, linked at the bottom of this page.`,
  },
  {
    heading: 'Report a bug or ask for a feature',
    body: `Email us with what you were doing, what you expected, and what happened instead. A screenshot and your device model help a lot.

Feature requests are genuinely read — a good part of the app exists because someone asked.`,
  },
];
