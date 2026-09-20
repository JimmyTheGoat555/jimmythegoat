// A good-faith, plain-language baseline — NOT a substitute for a lawyer
// reviewing your specific situation (jurisdiction, whether you incorporate
// a company, etc.), especially once real users' health-adjacent data
// (body weight) is actually flowing through this app. Written to
// accurately describe what THIS app actually does today (see
// firestore.rules for the real access model this describes) rather than
// generic boilerplate — update both docs whenever a feature changes what
// data is collected or who can see it.
//
// A dedicated inbox the developer controls — deliberately not a personal
// address, since this string is public the moment anyone opens the
// privacy/terms screen and will be scraped for spam.
export const CONTACT_EMAIL = 'jimmythegoat.app@gmail.com';
// Each document carries its own date. Both moved on September 18, 2026:
// the terms (the automated-coaching disclaimer, injury liability,
// governing law) and the policy (cookies and local storage, disclosure
// when legally required, retention and the security disclaimer).
export const LAST_UPDATED = 'September 18, 2026';
export const TERMS_LAST_UPDATED = 'September 18, 2026';
// What an account accepted. Stamped on users/{uid} at sign-up and by the
// consent gate (hooks/useLegalConsent.js); bump it whenever either
// document changes in a way people must agree to again, and every
// signed-in account is asked once more before the app renders. The
// suffix: the policy changed later the same day the terms did, after the
// gate had already shipped with the plain date.
export const LEGAL_VERSION = '2026-09-18.1';

export const PRIVACY_POLICY_SECTIONS = [
  {
    heading: 'What we collect',
    body: `Account info you provide: Your email, display name, and password (Firebase Auth stores your password in hashed form — nobody at Jimmy the Goat, including us, can see it).

Fitness data you log: Workouts (exercises, weights, reps, sets, timestamps), body-weight entries, height, body type, fitness goal, weekly workout target, and your weigh-in day.

Social & coaching data: A trainer code if you connect to a coach, friend connections (only formed when both people mutually accept), and summaries of your completed workouts shown in your friends' feed (exercise name, total sets/volume, coins earned, and any cosmetic you had equipped) — never your body weight or email.

In-app economy: Coins earned and items you've unlocked or equipped.

Device data for notifications: If you turn on push notifications, a token identifying your device (not you personally) so we know where to deliver them.

Cookies & Local Storage: Because Jimmy the Goat is a web-based app (PWA), we use your browser's local storage to keep you logged in and save your local preferences (like sound effects). We do not use third-party tracking cookies.`,
  },
  {
    heading: 'How we use it',
    body: `To run the app: track your workouts and progress, connect you with a trainer or friends you choose to add, award coins for verified workouts, and send you the reminders you've opted into (weekly weigh-in nudges, updates from your trainer). That's it. We don't run ads, we don't sell your data, and we don't use it for marketing outside the app.`,
  },
  {
    heading: 'Who can see your data',
    body: `You: Always see everything of your own.

A connected trainer: Can see your logged workouts and body-weight history — never anyone else's.

Mutual friends: Can see a short summary of workouts you complete (exercise, volume, coins earned, and cosmetics). They never see your body weight, your email, or your full workout log.

Legal Requirements: While we strictly protect your privacy, we may disclose your information if legally required to do so (for example, to comply with a valid subpoena, court order, or legal process) or to protect the safety, rights, or property of Jimmy the Goat, our users, or the public.

Nobody else: We don't share or sell your data to advertisers or unrelated third parties.`,
  },
  {
    heading: 'Where it lives & data security',
    body: `Your data is stored and processed using Google Firebase (Firestore for data, Firebase Authentication for your login, Cloud Functions for the anti-cheat/reward logic, Cloud Messaging for push notifications) and the app itself is hosted on Vercel. Both are infrastructure providers processing data on our behalf under their own strict security standards — neither uses your data for their own separate purposes.

Data Retention & Security: We hold onto your data for as long as you have an active account. While we use industry-standard services like Firebase to secure your data, no method of transmission over the internet or electronic storage is 100% secure. We cannot guarantee absolute security, and you use the app at your own risk.`,
  },
  {
    heading: 'Your choices',
    body: `You can edit or delete individual entries yourself in the app — body-weight log entries, friends, and more.

Push notifications and sound effects can be turned off anytime from Settings.

You can delete your entire account from Settings → Delete my account. That removes your profile, your workout history, your templates, your coins and purchases, and takes you off your friends' lists — permanently, and without needing to ask us.

To request a full copy of your data, email us at ${CONTACT_EMAIL}.`,
  },
  {
    heading: "Children's privacy",
    body: `Jimmy the Goat isn't intended for children under 13, and we don't knowingly collect information from them. If you believe a child has created an account, contact us at ${CONTACT_EMAIL} and we'll remove it.`,
  },
  {
    heading: 'Changes to this policy',
    body: `If we materially change what we collect or how we use it, we'll update this page and the "last updated" date. Continuing to use the app after a change means you accept the update.`,
  },
  {
    heading: 'Contact',
    body: `Questions about this policy or your data? Email us at ${CONTACT_EMAIL}.`,
  },
];

export const TERMS_OF_SERVICE_SECTIONS = [
  {
    heading: 'Agreement',
    body: `By creating an account or using Jimmy the Goat, you agree to these terms. If you don't agree, please don't use the app.`,
  },
  {
    heading: 'What this app is',
    body: `Jimmy the Goat is a strength-training tracker with optional coaching, friends, and light gamification (coins, cosmetics, an evolving mascot) layered on top of your own logged workouts.`,
  },
  {
    heading: 'Not medical advice',
    body: `Jimmy the Goat is not a medical device and doesn't provide medical or professional fitness advice. Talk to a physician before starting any new exercise program, especially if you have an existing health condition. Any automated workout tips, prompts, or progression recommendations generated by the app are general suggestions, not tailored professional advice. You use the app, and perform any exercise you log or are assigned, entirely at your own risk.`,
  },
  {
    heading: 'Your account',
    body: `You're responsible for keeping your password secure and for what happens under your account. Give us accurate info when you sign up. Your username can only be changed once — choose it carefully.`,
  },
  {
    heading: 'Coaching & social features',
    body: `Connecting to a "trainer" through this app is not a verification of that person's qualifications or certification — it only reflects a connection the two of you set up. Use your own judgment about any advice or assigned workouts from a coach or friend. Friend connections require both people to accept; a completed workout you log may be visible to friends you've connected with, as described in our Privacy Policy.`,
  },
  {
    heading: 'Coins & the in-app store',
    body: `Coins are earned by logging verified workouts and can be spent on cosmetic dances and accessories. Coins and items have no real-world monetary value, can't be redeemed for cash, and can't be transferred between accounts. We may adjust reward rates, prices, or the item catalog at any time.`,
  },
  {
    heading: 'Acceptable use',
    body: `Don't try to manipulate the workout validation or anti-cheat systems, harass or impersonate other users, or use the app for anything illegal. We may suspend or terminate accounts that violate this.`,
  },
  {
    heading: 'Ownership',
    body: `The app's design, code, and content belong to its developer. Your own logged workouts and data are yours — see the Privacy Policy for how to get a copy or delete them.`,
  },
  {
    heading: '"As is", no warranty',
    body: `The app is provided "as is," without guarantees that it will always be available, error-free, or uninterrupted. To the maximum extent permitted by law, we aren't liable for any indirect or consequential damages, nor are we liable for any personal injury, death, or physical harm arising from your use of the app or reliance on its features.`,
  },
  {
    heading: 'Governing law',
    body: `These terms are governed by the laws of the State of Israel. Any legal disputes related to the app or these terms will be handled exclusively in the competent courts located in Israel.`,
  },
  {
    heading: 'Changes',
    body: `We may update these terms as the app changes. Continuing to use the app after an update means you accept the new terms.`,
  },
  {
    heading: 'Contact',
    body: `Questions about these terms? Email ${CONTACT_EMAIL}.`,
  },
];
