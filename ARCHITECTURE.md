# Jimmy the Goat — Project Architecture & State Summary

A gamified strength-training PWA. You log workouts; a goat mascot ("Jimmy") evolves
through four tiers as your lifetime relative-strength volume grows; you earn coins,
buy cosmetics, dress the goat, and compare/compete with friends.

- **Live:** https://jimmy-the-goat.vercel.app
- **Firebase project:** `jimmy-the-goat`
- **Repo:** github.com/JimmyTheGoat555/jimmythegoat

> Generated from the source, not from memory. Where a thing does *not* exist, this
> document says so explicitly — those absences are usually the most useful part.

---

## 1. Tech Stack & Libraries

### Client

| Concern | Choice | Version |
|---|---|---|
| Framework | React | 19.2 |
| Build | Vite | 8.2 |
| Routing | react-router-dom | 7.18 |
| Styling | Tailwind CSS (v4, PostCSS plugin) | 4.3 |
| Charts | recharts | 3.10 |
| Icons | lucide-react | 1.42 |
| Confetti | canvas-confetti | 1.9 |
| Backend SDK | firebase (JS SDK, modular) | 12.18 |
| PWA | vite-plugin-pwa (`injectManifest`) + workbox-precaching | 1.3 / 7.4 |
| Lint | oxlint | 1.79 |

**Language:** JavaScript + JSX. Two files are TypeScript (`Leaderboard.tsx`,
`JimmyEvolution.tsx`) — the project is *not* TS-first and has no `tsc` in the build.

### ⚠️ There is no animation library

**`framer-motion` is not installed and never has been.** Neither is GSAP, react-spring,
or motion. All motion in this app is **hand-written CSS `@keyframes` in `src/index.css`**
(22 of them: `goat-evolve`, `cheer-pop`, `cheer-burst`, `button-burst`, `screen-shake`,
`chest-sheen-sweep`, `chest-rays-spin`, `tab-slide-in-forward`, `pedestal-pulse`,
`rainbow-glow-pulse`, `reward-pop`, `tip-in`/`tip-out`, …) plus Tailwind's
`transition-*` / `active:scale-*` utilities.

`canvas-confetti` is the only runtime animation dependency, and it draws particles
only — it does not animate DOM.

Dance emotes are **animated WebP** in an `<img>`, not `<video>` and not a JS animation:
H.264 has no alpha channel, so the source MP4s showed a checkerboard behind the goat.
Consequence: there is no `play()`, no `currentTime`, no `loop` attribute. Playback is
controlled by (a) a loop count baked into each file and (b) changing the `src` — a
`#fragment` is a distinct URL to the image decoder but the same resource to the
network, so a replay costs no bytes. See `JimmyAnimation.jsx`.

### Server

| Concern | Choice |
|---|---|
| Compute | Cloud Functions for Firebase **v2**, Node 22 |
| SDK | firebase-admin 14.3, firebase-functions 7.3 |
| Region | **default (`us-central1`)** — not overridden on either side |
| DB | Cloud Firestore (native mode) |
| Auth | Firebase Auth — **email + password only** |
| Push | Firebase Cloud Messaging (web push) |
| Hosting | Vercel (SPA rewrites) |

**Auth note:** there is no Google/Apple/phone sign-in, and **email verification is
deliberately disabled** — the `requireVerifiedEmail` guard was removed because ~29 of 31
real accounts were unverified and it was locking people out of the social features.

---

## 2. Database Schema (Firestore)

Every path that exists, from `firestore.rules` plus its writers. `//` marks who may
write, since that is the load-bearing detail in this schema.

```jsonc
// ───────────────────────────────────────── TOP LEVEL

friendCodes/{CODE}                 // public lookup table: code → uid
{ uid: string }

trainerCodes/{CODE}                // same, for trainer↔trainee pairing
{ uid: string }

feedPosts/{postId}                 // WRITE: Cloud Functions only (logWorkout)
{                                  // READ: any signed-in user
  userId: string,
  userName: string,
  headline: string,                // e.g. "Bench Press + 4 more"
  exerciseCount: number,
  totalSets: number,
  totalVolume: number,             // raw kg — display only
  lifetimeVolume: number,          // poster's lifetime RSV after this workout
  score: number,                   // this workout's Relative Strength Volume
  coinsEarned: number,
  equippedDance: string | null,
  equippedAccessory: string | null,// legacy single slot, still written
  equippedAccessories: string[],   // the multi-slot loadout actually rendered
  timestamp: string,               // ISO
  personalRecords?: [...]          // only when the poster opted in per-post
}

feedPosts/{postId}/likes/{likerUid}   // WRITE: create/delete by that liker only
{ likedAt: string, likerUid: string } // no update, ever; no counter field

cheers/{ownerUid}__{itemId}           // parent doc is a PATH SEGMENT ONLY — never written
cheers/{targetId}/likes/{likerUid}    // cheers on PRs & routines, which are not documents
{ likedAt: string, likerUid: string }

rateLimits/{uid}                      // WRITE: Admin SDK only; client cannot read or reset
{ /* hourly friend-request counters, per-friend nudge cooldowns */ }

// ───────────────────────────────────────── PER USER

users/{uid}                        // READ: owner + connected trainer ONLY
{
  email: string,
  displayName: string,
  role: 'trainee' | 'trainer',
  trainerCode: string,             // this account's own code (if trainer)
  trainerId: string | null,        // who coaches me
  friendCode: string,              // this account's own share code
  friends: string[],               // uids — MUTUAL, server-managed
  coins: number,                   // ⚠ server-managed
  unlockedDances: string[],        // ⚠ server-managed
  unlockedAccessories: string[],   // ⚠ server-managed
  equippedDance: string | null,    // client-writable
  equippedAccessory: string | null,// client-writable (legacy)
  equippedAccessories: string[],   // client-writable, max 5, must be owned
  badges: [{ id, at }],            // ⚠ server-managed
  sharePRs: boolean,               // ⚠ server-managed (setSharePRs callable)
  lastWorkoutAt: string,           // ⚠ server-managed
  hasUnreadNudgePush: boolean,
  usernameChangedOnce: boolean,    // one username change per account, ever
  createdAt: string,
  referredBy?: string, referredAt?: string
}
// Client UPDATE allowlist is exactly:
//   displayName, usernameChangedOnce, trainerId,
//   equippedDance, equippedAccessory, equippedAccessories,
//   hasUnreadNudgePush, friendCode
// Everything else is Admin-SDK-only. `allow delete: if false`.

users/{uid}/public/summary         // READ: ANY signed-in user. The only public mirror.
{
  displayName: string,
  lifetimeVolume: number,          // drives the tier a friend sees
  sharePRs: boolean,
  personalRecords?: [{ exerciseId, name, weight, reps }],  // FIELD IS DELETED when sharing is off
  unlockedDances: string[],        // for the dance showcase
  equippedDance: string | null,    // ← the only 3 fields a client may write here
  equippedAccessory: string | null,
  equippedAccessories: string[]
}

users/{uid}/workouts/{workoutId}   // the real private log
{
  exercises: [{
    exerciseId: string,
    name: string,
    muscleGroup: string | null,
    isBodyweight?: true,
    sets: [{
      id: string,
      weight: number,              // effective load
      reps: number,
      relativeVolume: number,      // (effectiveLoad / bodyWeight) * reps
      completed: true,
      isBodyweight?: true, addedWeight?: number, bodyWeightAtLog?: number
    }]
  }],
  startedAt: string, finishedAt: string,
  assignedWorkoutId: string | null,
  verified: true,                  // ONLY a server-written workout can carry this
  coinsEarned: number,
  score: number,                   // sum of relativeVolume; 0 for recovery workouts
  totalVolumeKg: number,
  recoveryWorkout: boolean
}

users/{uid}/meta/records           // ⚠ server-only. Killed an O(N)-reads-per-log design.
{
  bestPerExercise: { [exerciseId]: { weight, reps, name } },
  lifetimeVolume: number,
  workoutCount: number,
  streakDays: number,
  lastWorkoutDay: number,
  maxSetScore: number
}

users/{uid}/meta/economy           // ⚠ server-only — abuse window
{ recentWorkoutLogs: string[], lastWorkoutAt: string }

users/{uid}/meta/profile           // owner-writable body data
{
  name: string, heightCm: string,
  bodyWeightLog: [{ id, date, weight, visibility: 'public'|'private' }],
  bodyType: string, fitnessGoal: string, weeklyTarget: string,
  weighInDay: '' | 0..6
}

users/{uid}/templates/{templateId} // saved routines — STRUCTURE ONLY, no sets/reps/loads
{ title: string, exercises: [{ exerciseId, name, muscleGroup }], createdAt: string }

users/{uid}/notifications/{id}     // inbox; a new doc here auto-fires a push
{ type: string, title: string, body: string, data?: {...},
  read: boolean, createdAt: string }

users/{uid}/friendRequests/{fromUid}  // ⚠ fully server-managed, read-only to client
{ fromUid, fromName, status: 'pending', createdAt }

users/{uid}/fcmTokens/{token}      // owner only, both directions
{ createdAt: string }

users/{uid}/assignedWorkouts/{id}  // trainer → trainee
{ title, exercises, assignedBy, assignedByName, status: 'pending'|'completed', createdAt }
```

### There is no `prs` collection

Personal records are **derived**, never stored as their own documents. They live as
`bestPerExercise` inside `users/{uid}/meta/records` (private, server-maintained) and as
a `personalRecords` array inside `users/{uid}/public/summary` (public, opt-in). This is
why cheering a PR needs the `cheers/{ownerUid}__{itemId}` side-collection — there is no
PR document to hang a subcollection off.

### There are no phone numbers, and no contacts data

Nothing in the schema stores a phone number, and there is no address-book or
contact-matching surface anywhere. Relevant to any "find friends" feature.

### Indexes

- Composite: `feedPosts (userId ASC, timestamp DESC)`
- Collection-group field overrides: `friendRequests.fromUid`, `likes.likerUid`
  (both exist so account deletion can sweep a user's traces out of *other* people's docs)

---

## 3. Global State

**There is almost no global state machinery.** No Redux, no Zustand, no Jotai, no
TanStack Query. The pattern is:

```
Firebase onSnapshot  →  custom hook  →  App.jsx  →  props
```

`App.jsx` is the single composition root. It calls ~15 hooks and prop-drills the
results. This is deliberate and works at the current size; it is also the main thing
that would need revisiting before the tree gets much deeper.

### The one React Context: `JimmyLook`

`src/context/JimmyLook.jsx` publishes **only the signed-in user's** look:

```js
{ evolutionStage: 1|2|3|4, equippedAccessories: string[] }
```

Used as `<JimmyAvatar {...useJimmyLook()} size="lg" />`.

**It is scoped on purpose, and `JimmyAvatar` is deliberately NOT context-aware.** A
leaderboard row, a feed post, and a friend's profile all draw *somebody else's* goat
from data that arrives with that row. If the avatar silently fell back to "the current
user", a forgotten prop would render wrong data that looks entirely plausible
(everyone quietly wearing your hat) instead of an obvious blank.

### Where each piece of state actually lives

| State | Source | Notes |
|---|---|---|
| `user` (auth) | `useAuth` → `onAuthStateChanged` | |
| `account` / `profile` (the `users/{uid}` doc) | `useAuth` → `onSnapshot` | aliased as `account` in App |
| `coins`, `unlockedDances`, `unlockedAccessories` | **the same `account` doc** | `useEconomy` holds *no state*; it only calls callables. Values arrive live via the account listener the instant the server writes them. |
| `evolutionStage` | **derived, never stored** | `getEvolutionProgress(lifetimeVolume(workouts), { lastWorkoutAt })` in `App.jsx` |
| `equippedAccessories` | `account` doc → `JimmyLookProvider` | |
| body metrics | `useCloudProfile` → `meta/profile` | |
| workouts | `useCloudWorkouts` | |
| friends / requests | `useFriendsGraph` | |
| feed | `useFeed` | |
| notifications | `useNotifications` | |
| active workout in progress | `useWorkouts` (local + localStorage) | survives a reload mid-session |

### Evolution tiers (derived, points-based — *not* kg)

```js
goat   → threshold     0  → stage 1  '/assets/jimmy-goat.png'
buff   → threshold   400  → stage 2  (~4 workouts)
titan  → threshold  2000  → stage 3  (~20 workouts)
legend → threshold  5000  → stage 4  (~50 workouts)
```

Measured in **Relative Strength Volume** (`load / bodyweight * reps`), so a lighter
lifter ranks on the same scale as a heavier one. A **neglect penalty** drops the
effective tier by exactly one after 5 idle days; any workout lifts it.

### Server authority model

The client may never write `coins`, `friends`, `badges`, `sharePRs`, `unlockedDances`,
`unlockedAccessories`, or `lastWorkoutAt`. Those flow only through callables, and
`firestore.rules` enforces it with a diff-based allowlist. The store catalog is
**duplicated on purpose** (`src/data/storeItems.js` ↔ `functions/storeCatalog.js`) so
a tampered client can never buy at its own price — the server ignores whatever cost
the client sends.

### Cloud Functions (18 deployed)

```
Callables:  logWorkout · purchaseItem · deleteAccount · disconnectTrainer · notifyTrainer
            claimReferral · completeOnboardingProfile · setSharePRs
            sendFriendRequest · respondToFriendRequest · removeFriend · suggestFriends
            sendFriendNudge
Triggers:   notifyOnPostCheer · notifyOnItemCheer · sendPushOnNotificationCreate
Scheduled:  weeklyWeighInReminders (08:00 daily) · teaseLazyGoats (10:00 daily)
```

**One rule keeps this simple:** `sendPushOnNotificationCreate` turns *any* new doc in
`users/{uid}/notifications` into a push. A new notification type therefore never needs
new server code.

---

## 4. Component Tree

```
src/
├── App.jsx ................... Composition root: all hooks, all routes, all prop-drilling.
├── main.jsx .................. Bootstrap + periodic service-worker update checks (hourly).
├── sw.js ..................... Custom service worker (injectManifest strategy).
│
├── context/
│   └── JimmyLook.jsx ......... The signed-in user's {evolutionStage, equippedAccessories}.
│
├── components/
│   ├── evolution/
│   │   ├── JimmyAvatar.jsx ... ⭐ The paper-doll renderer: tier sprite + per-stage accessory
│   │   │                        layering, two-pass behind/front for the "worn" 3D illusion.
│   │   ├── JimmyAnimation.jsx  Hero display: static sprite swapped for an animated-WebP dance.
│   │   ├── accessoryArt.jsx .. Registry mapping catalog id → PNG, aspect, and behind-fraction.
│   │   └── JimmyEvolution.tsx  Tier-progress presentation.
│   │
│   ├── workout/
│   │   ├── WorkoutHome.jsx ... Launchpad: Jimmy on his pedestal, hype line, mission carousel.
│   │   ├── ActiveWorkoutLogger.jsx  The live session: exercises, sets, rest timer.
│   │   ├── ExerciseLogCard.jsx / SetRow.jsx / SetEntrySheet.jsx  Per-exercise & per-set entry.
│   │   ├── ExercisePicker.jsx / MuscleGroupPicker.jsx  Exercise selection.
│   │   ├── FullScreenTimer.jsx / WorkoutTimer.jsx  Rest timing, readable from across a gym.
│   │   ├── WorkoutSummaryModal.jsx / WorkoutSummaryChecklist.jsx  Post-workout recap.
│   │   ├── SilverChest.jsx / SilverLootboxModal.jsx  First-workout free-dance moment.
│   │   ├── HypeSpeechBubble.jsx / MissionCard.jsx / ReorderableList.jsx  Supporting UI.
│   │
│   ├── social/
│   │   ├── SocialPage.jsx .... Tab shell: notifications → leaderboard → suggestions →
│   │   │                        friends → feed.
│   │   ├── Leaderboard.tsx ... Weekly RSV ranking from friends' feed posts; rows link to profiles.
│   │   ├── PublicFriendProfile.jsx ⭐ Someone else's profile — sanitized, mystery progress bar,
│   │   │                        public PRs, weightless routines, cheers, tappable avatar.
│   │   ├── FriendDancesModal.jsx  Dance showcase: their goat performs the emotes they own.
│   │   ├── FriendSuggestions.jsx  "People you might know" carousel (friends-of-friends).
│   │   ├── FriendsManager.jsx  Friend code, incoming requests, current friends.
│   │   ├── SocialFeed.jsx / FeedPostCard.jsx  The feed and its cheerable cards.
│   │   ├── NotificationsList.jsx  Inbox rendering.
│   │   └── NudgeModal.jsx .... Fixed-list nudge picker (no free text, on purpose).
│   │
│   ├── progress/
│   │   ├── ProgressView.jsx .. Stats tab shell.
│   │   ├── StreakHeatmap.jsx / WeeklyVolumeCard.jsx / LifetimeVolumeCard.jsx
│   │   ├── WeeklySummaryCard.jsx / MuscleGroupGoals.jsx / RecentWorkoutsList.jsx / StatTile.jsx
│   │
│   ├── shop/
│   │   └── GymShop.jsx ....... Coin store: dances + accessories, previewed on YOUR stage's Jimmy.
│   │
│   ├── profile/
│   │   ├── ProfileView.jsx ... Own profile: body stats, badges, settings entry.
│   │   ├── SettingsPanel.jsx  Username, PR sharing, trainer link, account deletion.
│   │   ├── BadgeShelf.jsx / WeighInModal.jsx / NotificationPromptModal.jsx
│   │
│   ├── trainer/
│   │   ├── TrainerDashboard.jsx  Trainee roster.
│   │   ├── TraineeDetail.jsx / TraineeWorkoutDetail.jsx  Read-only trainee history.
│   │   ├── AssignWorkoutForm.jsx  Push a workout to a trainee.
│   │   └── ReadOnlyExerciseCard.jsx
│   │
│   ├── auth/       AuthScreen.jsx · OnboardingFlow.jsx · FirebaseSetupNeeded.jsx
│   ├── history/    HistoryList.jsx · WorkoutDetail.jsx
│   ├── layout/     BottomNav.jsx · TopHud.jsx (coin balance) · tabPaths.js
│   ├── legal/      LegalDocument.jsx
│   └── shared/     GradientBorder.jsx (tier-coloured frame) · ConfirmDialog.jsx
│                   ErrorBoundary.jsx · WheelPicker + BodyWeight/Date/Height/Scroll variants
│
├── hooks/    useAuth · useEconomy · useCloudWorkouts · useCloudProfile · useWorkouts
│             useFriendsGraph · useFriendProfile · useFriendSuggestions · useFeed
│             useCheers · useNotifications · useWorkoutTemplates · useAssignedWorkouts
│             useTrainerTrainees · useExercises · useRestTimer · useWakeLock
│             useTierUpCelebration · useLazyGoatNudge · useTabSwipe · useLocalStorage
│
├── utils/    evolutionTiers · workoutStats · personalRecords · friendPrivacy ⭐
│             danceAnimations · tierTheme · volumeTiers · heatmap · weighIn · units
│             onboarding · exerciseSorting · lastPerformance · restMessages · restAlarmSound
│
├── data/     storeItems ⭐ · exercises · badges · nudgeMessages · gymQuotes · restTips
└── lib/      firebase · messaging (FCM) · storage · lazyNudge
```

### Routes

```
/  /progress  /social  /friends/:friendUid  /profile  /shop  /history
/workouts/:id  /workout
/trainees  /trainees/:id  /trainees/:id/assign  /trainees/:id/workouts/:workoutId
```

---

## 5. Fully Implemented Features

### Core loop
- [x] **Email/password auth** + onboarding questionnaire (body type, goal, weekly target)
- [x] **Workout logging** — exercise picker, per-set weight/reps, reorderable, bodyweight
      exercises with added weight, rest timer with wake-lock and an audio alarm that
      survives a locked screen
- [x] **Server-validated logging** — `logWorkout` is the single scoring/reward authority;
      client-written workouts can never carry `verified: true`
- [x] **Relative Strength Volume scoring** — `load / bodyweight * reps`, so bodyweight matters
- [x] **Incremental records aggregate** — `meta/records` replaced a full-history re-scan on
      every single log (was O(N) reads per workout)
- [x] **Workout templates** (structure-only) and **trainer-assigned workouts**
- [x] **History**, workout detail, edit and delete

### Progression & economy
- [x] **4-tier evolution** with neglect penalty and a tier-up celebration
- [x] **Coin economy** — server-authoritative, twin catalogs, rate-limited
- [x] **Shop** — 4 dances + 6 accessories, previewed on your own tier's Jimmy
- [x] **Silver Lootbox** — first real workout grants a free dance, once ever per account
- [x] **Achievement badges** — re-derived server-side from stored history
- [x] **Dance emotes** — animated WebP, 4 dances × 4 stages, replay-by-fragment

### Paper doll
- [x] **Multi-slot layering** — legs / body / neck / head / eyes, max 5, ownership enforced in rules
- [x] **Per-stage placement** — every accessory has its own top/left/width per tier, calibrated
      against measured sprite landmarks (pupil span, eye line, neck base, hip, sole)
- [x] **`object-contain` box reconstruction** — one calibration serves every screen size
- [x] **Two-pass behind/front rendering** with `clip-path: inset()` so a garment reads as
      *worn* rather than stickered on (the neck occludes the collar's back edge)
- [x] **Avatar consistency everywhere** — profile, progress, workout, feed, leaderboard, shop

### Social
- [x] **Mutual friend requests** via friend codes, server-managed both sides atomically
- [x] **Weekly leaderboard** on RSV, built from friends' feed posts (never their private logs)
- [x] **Social feed** with cheers (likes)
- [x] **Cheers on PRs and routines** via the `{ownerUid}__{itemId}` side-collection,
      optimistic UI with rollback, **double-tap to like**
- [x] **Cheer notifications** — Firestore triggers, self-cheers skipped, names the actual lift
- [x] **Public friend profile** — mystery progress bar (position, never a number),
      opt-in PRs, weightless routines, "Copy to My Workouts"
- [x] **Data sanitization** — `sanitizeFriendData` allowlist; PR sharing DELETES the field
      rather than flagging it, so there is nothing to filter when it is off
- [x] **Interactive friend avatar** → dance showcase modal
- [x] **Friend suggestions** — friends-of-friends, ranked by mutual count, no user input
      (so it cannot be used as a "does this person exist" oracle)
- [x] **Nudges** — fixed message list, rate-limited per friend and globally
- [x] **Leaderboard rows link to profiles**

### Platform
- [x] **PWA** — installable, offline shell, hourly + on-focus service-worker update checks
- [x] **Web push (FCM)** — any new notification doc becomes a push, one rule for all types
- [x] **Scheduled jobs** — weigh-in reminders, lazy-goat teasing
- [x] **Trainer mode** — roster, read-only trainee history, workout assignment
- [x] **Account deletion** — 8 steps, including sweeping this user's cheers out of *other*
      people's items via a collection-group query
- [x] **Rate limiting** — `rateLimits/{uid}`, Admin-SDK-only so devtools cannot reset it

---

## Known gaps / open threads

These are real and current — worth knowing before proposing features.

- **Friend requests are silent.** `functions/social.js` writes **no** notification when a
  request arrives. No badge, no push, no inbox entry. This is the single biggest hole in
  the social loop.
- **Like notifications do not coalesce** — one push per like.
- **Saved routines are never published.** `sanitizeFriendData` handles them and
  `PublicFriendProfile` renders them, but nothing writes `savedWorkouts` to
  `public/summary`, so that section is always empty today.
- **Deploy pending:** `suggestFriends` and the `unlockedDances` publishing in
  `logWorkout`/`purchaseItem` are written and locally verified but **not yet deployed**.
- **No dismissal memory** for friend suggestions — dismissing is local-only and they
  return on the next fetch.
- **`App.jsx` prop-drilling** is at the edge of comfortable.
- **Buff's hoodie asset** (`hoodie-2.png`) has a pale bar across the muzzle — a known
  artifact in the source image, kept at the owner's request.
- **No tests.** `npm run` offers `dev`, `build`, `lint`, `preview` — nothing else.

---

## Conventions worth matching

- **Comments explain *why*, not *what*** — and specifically the non-obvious constraint or
  the bug that motivated the shape. This codebase is unusually heavily commented; new code
  should match that density.
- **Allowlist, never blocklist**, for anything crossing a privacy boundary.
- **Server-authoritative for anything with value**; client-writable only for harmless vanity.
- **Field presence as the visibility control**, not a flag a reader must remember to check.
- **A `useRef` latch, not state, for in-flight guards** — three fast taps all read the same
  stale `state` from their closure and all three fire.
- **Derive during render**, not in an effect, where possible.
