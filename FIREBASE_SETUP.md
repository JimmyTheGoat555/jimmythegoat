# Firebase setup

One-time setup you need to do yourself (project creation needs your own
Google account) — about 5 minutes.

## 1. Create the project
1. Go to https://console.firebase.google.com → **Add project**.
2. Name it anything (e.g. "jimmy-the-goat"). Google Analytics is optional — skip it, not needed here.

## 2. Enable Email/Password auth
1. In the console: **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Email/Password**.

## 3. Create the Firestore database
1. **Build → Firestore Database → Create database**.
2. Any region is fine (pick one close to you). Start in **production mode** — the rules in `firestore.rules` (in this repo) replace the defaults.

## 4. Publish the security rules
Easiest path — no Firebase CLI needed:
1. In the console: **Firestore Database → Rules** tab.
2. Paste the contents of this project's `firestore.rules` file, replacing what's there.
3. Click **Publish**.

(If you'd rather use the CLI: `npm install -g firebase-tools`, `firebase login`, `firebase init firestore` — pointing it at this existing `firestore.rules` — then `firebase deploy --only firestore:rules`.)

## 5. Get your web app config
1. **Project settings** (gear icon) → scroll to **Your apps** → click the `</>` (web) icon → register an app (any nickname).
2. It shows a `firebaseConfig` object. Copy those values into `.env.local` (copy `.env.example` to `.env.local` first) — `apiKey`, `authDomain`, `projectId`, `storageBucket`, `appId`.

## 6. Restart the dev server
Vite only reads `.env.local` at startup, so stop and restart `npm run dev` after saving it.

Auth + Firestore with security rules run on the free Spark tier. The Cloud
Functions in `functions/` (the coin economy, friend graph, account
deletion, push fan-out) need the **Blaze** pay-as-you-go plan — at this
app's scale the monthly cost is typically cents, but a plan must be
attached. Deploy them with `firebase deploy --only functions` once
`cd functions && npm install` is done.

## Trying it out
- Sign up once as a **Trainer** — note the trainer code shown on the dashboard.
- Sign up again (different email, e.g. `+trainee` trick works: `you+t1@gmail.com`) as a **Trainee**, pasting that trainer code in.
- From the Trainer dashboard, tap the trainee → **Assign a Workout** → build a routine.
- Sign back in as the trainee — the assigned routine appears on Workout Home, ready to start.
