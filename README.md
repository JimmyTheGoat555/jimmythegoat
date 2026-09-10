# Jimmy the Goat (גימי העז)

A fast, no-nonsense strength-training tracker with light gamification — log
workouts, watch your goat mascot evolve as your lifetime tonnage grows,
earn coins for verified sessions, connect with a coach or friends.

Live: https://jimmy-the-goat.vercel.app

## Stack

- **Frontend:** Vite + React 19 + Tailwind CSS v4 + react-router-dom v7, deployed on Vercel
- **Backend:** Firebase — Auth (email/password), Firestore (with offline persistence),
  Cloud Functions v2 (the trusted path for anything touching the coin economy or
  two users' data at once), Cloud Messaging (push)
- **PWA:** vite-plugin-pwa (`injectManifest`) — installable, offline-capable app shell
- **Lint:** oxlint

## Local development

```bash
npm install
cp .env.example .env.local     # then fill in the Firebase web config — see FIREBASE_SETUP.md
npm run dev
```

`npm run build` produces the production bundle; `npm run lint` runs oxlint.

Cloud Functions live in `functions/` with their own `package.json`:

```bash
cd functions && npm install
```

## Deploying

Two independent targets, both manual:

| Target | Command | What it ships |
|--------|---------|---------------|
| Frontend | `npx vercel --prod` | the React app (linked Vercel project) |
| Backend | `firebase deploy --only functions,firestore:rules` | Cloud Functions + Firestore security rules |

CI (`.github/workflows/ci.yml`) runs lint + build + a functions syntax/audit
check on every push and PR — it gates merges, it does not deploy.

## Project layout

```
src/
  components/   feature-grouped UI (workout, progress, social, shop, trainer, …)
  hooks/        one hook per Firestore surface; each is a no-op until `uid` exists
  lib/          firebase.js (SDK init, App Check, offline cache), messaging.js
  utils/        pure helpers — evolution tiers, personal records, stats
functions/      Cloud Functions — economy.js is the only writer of coins/verified workouts
firestore.rules default-deny; server-managed fields locked; see the file's own comments
source-media/   the offline pipeline that keys + normalises the dance clips (raw MP4s gitignored)
```

## Security model (short version)

- Firestore rules are default-deny. `coins`, `unlockedDances/Accessories`, `friends`,
  and `sharePRs` on `users/{uid}` can only be written by the Admin SDK inside Cloud
  Functions — never by a direct client write.
- `logWorkout` re-validates every set server-side (weight/rep bounds, set caps),
  recomputes volume and coins, and enforces a rolling-window rate limit inside a
  transaction. Client-sent `verified`/`coinsEarned` are ignored.
- Outbound social actions (friend requests, nudges) require a verified email and are
  rate-limited (`functions/guards.js`, counters in the Admin-only `rateLimits/{uid}`).
- App Check (reCAPTCHA v3) is wired in `src/lib/firebase.js`, dormant until
  `VITE_FIREBASE_APPCHECK_SITE_KEY` is set — see that file for the rollout steps.
- Body weight and email never leave the owner + connected-trainer scope. The feed and
  public profile summary expose only Strava-tier data (exercise names, volume, cosmetics).
