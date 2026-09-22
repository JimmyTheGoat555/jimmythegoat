# Jimmy the Goat — Architecture & Code Summary

A gamified strength-training PWA (also shipped to iOS through Capacitor). You log
workouts; a goat mascot — **Jimmy**, or **Gena** for accounts that picked female at
onboarding — evolves through four tiers as your lifetime *relative-strength volume*
grows; you earn coins, buy cosmetics, dress the mascot, and compete with friends.

- **Live:** https://jimmy-the-goat.vercel.app
- **Firebase project:** `jimmy-the-goat` (Vercel scope `reef14`)
- **iOS bundle id:** `com.jimmythegoat.app`

> Generated from the source, not from memory. Where a thing does *not* exist, this
> document says so explicitly — those absences are usually the most useful part.
> Size of the codebase at the time of writing: **~35,700 lines of client JS/JSX across
> 206 files**, **~7,600 lines of Cloud Functions across 38 modules**, plus 14 dev
> harness pages and 5 Node test files.

---

## 0. Commands

```bash
npm run dev            # Vite dev server
npm run build          # vite build → dist/
npm test               # node --test over tools/*.test.mjs  (88 tests)
npx oxlint src dev     # lint (config: .oxlintrc.json)
npm run build:ios      # vite build + npx cap sync ios
npm run open:ios       # open the Xcode workspace

npx prettier --single-quote --print-width 120 --trailing-comma all --write <files>
npx vercel --prod --scope reef14 --yes                       # deploy the client
npx firebase deploy --only functions,firestore:rules --project jimmy-the-goat
```

There is **no** Prettier config file — the flags above are the project's de-facto
format. Some older data files predate the 120-column setting and are deliberately left
unformatted (`src/data/restTips.js`); do not reformat them wholesale.

---

## 1. Tech Stack

### Client

| Concern | Choice | Version |
|---|---|---|
| Framework | React | 19.2 |
| Build | Vite | 8.2 |
| Routing | react-router-dom | 7.18 |
| Styling | Tailwind CSS v4 (PostCSS plugin, `@theme` tokens) | 4.3 |
| Charts | recharts | 3.10 |
| Icons | lucide-react | 1.42 |
| Confetti | canvas-confetti | 1.9 |
| Backend SDK | firebase (modular JS SDK) | 12.18 |
| PWA | vite-plugin-pwa (`injectManifest`) + workbox | 1.3 / 7.4 |
| Native shell | Capacitor 8 (+ `@capacitor-community/admob`, `@capacitor-firebase/messaging`, `local-notifications`) | 8.5 |
| Lint | oxlint | 1.79 |

**Language:** JavaScript + JSX. Exactly two files are TypeScript
(`components/social/Leaderboard.tsx`, `components/evolution/JimmyEvolution.tsx`). The
project is *not* TS-first and there is no `tsc` in the build.

### ⚠️ There is no animation library

**`framer-motion` is not installed and never has been.** Neither is GSAP, react-spring
or motion. All motion is hand-written CSS `@keyframes` in `src/index.css` plus
Tailwind's `transition-*` / `active:scale-*` utilities. `canvas-confetti` draws
particles only — it does not animate DOM. Long-running, frame-driven animation (the
end-of-workout card, the share sticker) is painted with the **Canvas 2D API**
(`utils/workoutSummaryScene.js`, `utils/workoutSticker.js`) driven by
`hooks/useAnimationClock.js`.

Dance emotes are **animated WebP** in an `<img>`, not `<video>`: H.264 has no alpha
channel, so the source MP4s showed a checkerboard behind the goat. Consequence: no
`play()`, no `currentTime`, no `loop`. Playback is controlled by a loop count baked
into each file and by changing the `src` — a `#fragment` is a distinct URL to the image
decoder but the same resource to the network, so a replay costs no bytes.

### Server

| Concern | Choice |
|---|---|
| Compute | Cloud Functions for Firebase **v2**, Node 22 |
| SDK | firebase-admin 14.4, firebase-functions 7.4 |
| Region | **default (`us-central1`)** — not overridden on either side |
| DB | Cloud Firestore (native mode), 673 lines of rules |
| Auth | Firebase Auth — **email + password only**, e-mail verification **enforced** |
| Push | FCM (web push + APNs via Capacitor) |
| Hosting | Vercel (SPA rewrite `/(.*) → /index.html`) |

**Auth note:** there is no Google / Apple / phone sign-in. Verification *is* enforced
now — `App.jsx` renders `PendingVerificationScreen` and nothing else while
`!emailVerified` (this reverses an earlier decision recorded in older docs).

---

## 2. Repo layout

```
src/            206 files — the app
functions/      38 modules — Cloud Functions (CommonJS)
dev/            14 standalone harness pages (see §10)
tools/          5 Node test files + sprite/asset scripts + 2 admin CLI scripts
ios/            Capacitor iOS project (Xcode)
public/         sprites, dance WebPs, icons, splash
assets/ source-media/ video-src/   art pipeline sources (video-src is untracked)
firestore.rules  firestore.indexes.json  firebase.json  vercel.json
capacitor.config.json  vite.config.js  postcss.config.js  .oxlintrc.json
```

---

## 3. Database Schema (Firestore)

Every path that exists, from `firestore.rules` plus its writers. `//` marks who may
write, since that is the load-bearing detail in this schema.

```jsonc
// ───────────────────────────────────────── TOP LEVEL

config/{docId}                     // WRITE: admin callables only. READ: any signed-in user.
                                   // config/announcement — the global banner.

usernames/{key}                    // global uniqueness index: lowercased name → uid
{ uid: string }                    // WRITE: server only (usernames.js)

friendCodes/{CODE}                 // public lookup table: code → uid
trainerCodes/{CODE}                // same, for trainer↔trainee pairing

feedPosts/{postId}                 // WRITE: Cloud Functions only (logWorkout)
{                                  // READ: any signed-in user
  userId, userName, headline,      // "Bench Press + 4 more"
  exerciseCount, totalSets,
  totalVolume,                     // raw kg — display only
  lifetimeVolume,                  // poster's lifetime RSV after this workout
  score,                           // this workout's Relative Strength Volume
  coinsEarned, timestamp,          // ISO
  equippedDance, equippedAccessory, equippedAccessories[],
  personalRecords?                 // only when the poster opted in, per post
}
feedPosts/{postId}/likes/{likerUid}   // create/delete by that liker only; never update
{ likedAt, likerUid }                 // no counter field anywhere

cheers/{ownerUid}__{itemId}           // parent doc is a PATH SEGMENT ONLY — never written
cheers/{targetId}/likes/{likerUid}    // cheers on PRs & routines, which are not documents

rateLimits/{uid}                      // Admin SDK only; client cannot read or reset

// ───────────────────────────────────────── PER USER

users/{uid}                        // READ: owner + connected trainer ONLY
{
  email, displayName, role: 'trainee'|'trainer',
  trainerCode, trainerId, friendCode,
  friends: string[],               // ⚠ server-managed, MUTUAL
  coins: number,                   // ⚠ server-managed
  unlockedDances[], unlockedAccessories[],   // ⚠ server-managed
  equippedDance, equippedAccessory, equippedAccessories[],  // client-writable (max 5, must be owned)
  badges: [{id, at}],              // ⚠ server-managed
  sharePRs, lastWorkoutAt,         // ⚠ server-managed
  mascot, gender,                  // which character (mascots.js)
  usernameChangedOnce, mustChangeUsername,
  hasUnreadNudgePush, createdAt, referredBy?, referredAt?
}
// Client UPDATE allowlist is exactly: displayName, usernameChangedOnce, trainerId,
// equippedDance, equippedAccessory, equippedAccessories, hasUnreadNudgePush, friendCode.
// Everything else is Admin-SDK-only. `allow delete: if false`.

users/{uid}/public/summary         // READ: ANY signed-in user. The only public mirror.
{ displayName, lifetimeVolume, sharePRs, personalRecords?,
  unlockedDances[], equippedDance, equippedAccessory, equippedAccessories[] }
// personalRecords is DELETED, not flagged, when sharing is off.

users/{uid}/workouts/{workoutId}   // the real private log
{ exercises: [{ exerciseId, name, muscleGroup, isBodyweight?,
      sets: [{ id, weight, reps, relativeVolume, completed,
               isDropSet?, isPerHand?, perHandWeight?, addedWeight?, bodyWeightAtLog? }] }],
  startedAt, finishedAt, assignedWorkoutId,
  verified: true,                  // ONLY a server-written workout can carry this
  coinsEarned, score, totalVolumeKg, recoveryWorkout }

users/{uid}/meta/records           // ⚠ server-only. Killed an O(N)-reads-per-log design.
{ bestPerExercise: {[exerciseId]: {weight, reps, name}},
  lifetimeVolume, workoutCount, streakDays, lastWorkoutDay, maxSetScore }

users/{uid}/meta/economy           // ⚠ server-only — the abuse window
{ recentWorkoutLogs[], lastWorkoutAt }

users/{uid}/meta/profile           // owner-writable body data (onboarding fields are server-written)
{ name, heightCm, bodyWeightLog: [{id, date, weight, visibility}],
  bodyType, fitnessGoal, weeklyTarget, weighInDay }

users/{uid}/templates/{templateId} // saved routines — STRUCTURE ONLY, no sets/reps/loads
users/{uid}/notifications/{id}     // inbox; a new doc here auto-fires a push
users/{uid}/messages/{id}          // ⚠ server-only — direct message from the founder
users/{uid}/inbox/{itemId}         // ⚠ server-only — workout recommendations, bounty receipts
users/{uid}/recommendedBy/{templateId}  // who sent that routine
users/{uid}/friendRequests/{fromUid}    // ⚠ fully server-managed, read-only to client
users/{uid}/fcmTokens/{token}           // owner only, both directions
users/{uid}/assignedWorkouts/{id}       // trainer → trainee
reports/{reporterUid}__{reportedUid}    // ⚠ WRITE-ONLY from a client — abuse reports
```

### Blocking and reporting (App Store Guideline 1.2)

Two pieces, both client-written and enforced entirely by `firestore.rules` — no Cloud
Function is involved, deliberately, because the **functions deploy is held until the
App Store release** and the one feature whose job is to *get through* review must not
be stuck behind it. `firebase deploy --only firestore:rules` is all it needs.

**`users/{uid}.blockedUsers: string[]`** — owner-writable, capped at 500, self-blocks
refused. This is the one social field a client may write directly, and the contrast
with `friends` right beside it is the reason: a friendship is a claim about somebody
else that needs their consent, a block is a statement about what *you* are willing to
see. Absent on every account that predates the feature, and absent reads as "blocks
nobody" — **no backfill was needed**.

**`reports/{reporterUid}__{reportedUid}`** — `{ reporterUid, reportedUid, reason,
details, reportedName, surface, reportedAt }`. Two properties do the security work:

- **The id is deterministic**, which *is* the rate limit — one row per account you can
  see, so no client can flood the collection however many times it presses the button.
  Re-reporting overwrites that row. Same trick as `cheers/{ownerUid}__{itemId}`.
- **No client can read it.** Not the reporter, not the reported, not a trainer. A
  reporter who could read their report back is a reporter whose phone can be checked
  for one. Read it in the Firebase console.

`reportedAt == request.time` rather than a client clock — this is the only document in
the app whose author has a motive to lie about when something happened. `reportedName`
snapshots the username, because a name is the most-reported thing here and the account
can rename itself the moment it is reported.

**Filtering happens in one place.** `App.jsx` strips blocked uids out of
`account.friends` *before* `useFeed`/`useFriendsGraph`/`useFriendSummaries` see it, so a
blocked friend's posts are never fetched — and the feed, the friends directory, the
leaderboard and the public summaries all go quiet from that single line. Notifications
(`data.fromUid`), inbox items (`senderUid`) and friend requests (`fromUid`) are filtered
beside it; search and suggestions filter in their own components, because the callables
behind them know nothing about your block list.

**Settings → Blocked accounts is not optional.** Every other surface hides blocked
people by design, so once you have blocked someone there is nowhere left to tap a ⋯
beside them. That list is the only way back.

### There is no `prs` collection

Personal records are **derived**, never stored as documents. They live as
`bestPerExercise` in `users/{uid}/meta/records` (private, server-maintained) and as a
`personalRecords` array in `users/{uid}/public/summary` (public, opt-in). That is why
cheering a PR needs the `cheers/{ownerUid}__{itemId}` side-collection — there is no PR
document to hang a subcollection off.

### There are no phone numbers and no contacts data

Nothing in the schema stores a phone number; there is no address-book or
contact-matching surface anywhere. Relevant to any "find friends" feature. Friend
discovery is by **friend code**, by **username search** (`searchUsers` callable), or by
**friends-of-friends** (`suggestFriends`) — never by free-text scan of the user table.

### Indexes

- Composite: `feedPosts (userId ASC, timestamp DESC)`
- Collection-group field overrides: `friendRequests.fromUid`, `likes.likerUid` (both
  exist so account deletion can sweep a user's traces out of *other* people's docs)

---

## 4. Server: 44 deployed functions

All in `functions/`, CommonJS, exported through `index.js`.

**Callables (39)**

```
Economy      logWorkout · purchaseItem · rewardAdView · claimRestBoost
Account      deleteAccount · completeOnboardingProfile · setAccountRole
             claimUsername · checkUsernameAvailable · requireUsernameChange
             syncPublicDisplayName · setSharePRs · claimReferral · claimWelcomeFriend
Social       sendFriendRequest · respondToFriendRequest · removeFriend
             suggestFriends · searchUsers · sendFriendNudge
             recommendWorkout · acceptRecommendation · publishWorkoutRecords
Coaching     disconnectTrainer · notifyTrainer
Admin        adminAnalytics · adminSetAnnouncement · adminGrantCoins · adminGrantXp
             adminFindUsers · adminUserProfile · adminMessageUser · adminAdjustCoins
             adminShiftEvolution · adminSetMascot
Backfills    backfillUsernames · backfillFemaleMascots · friendEveryoneWithJimmy
```

**Triggers (3)** — `notifyOnPostCheer`, `notifyOnItemCheer`, `sendPushOnNotificationCreate`
**Scheduled (2)** — `weeklyWeighInReminders` (08:00 daily), `teaseLazyGoats` (10:00 daily)
**HTTP (1)** — `admobRewardCallback` (AdMob Server-Side Verification endpoint)

**One rule keeps push simple:** `sendPushOnNotificationCreate` turns *any* new doc in
`users/{uid}/notifications` into a push. A new notification type never needs new server
code.

### Module map

| Module | Lines | What it owns |
|---|---|---|
| `economy.js` | 1390 | The only coin entry points. Workout validation, scoring, rewards, first-workout grant. |
| `storeCatalog.js` | 302 | Server source of truth: validation bounds, anti-abuse limits, reward formula, item prices. |
| `records.js` | 464 | Personal-record + aggregate stats (ESM/CJS twin of `utils/personalRecords.js`). |
| `badges.js` | 294 | Award logic (twin of `data/badges.js`, which is display-only). |
| `adminAnalytics.js` | 562 | The Founder Console's single payload. |
| `adminUserActions.js` | 466 | "God mode" on one account: dossier, coins, tier, mascot, message. |
| `adminOps.js` | 182 | Global ops: announcement, mass coin/XP grants. |
| `appAdmin.js` | 97 | Who is an admin + the gate every admin callable runs first. |
| `usernames.js` | 346 | Globally unique names and the one rename path. |
| `guards.js` | 256 | Shared preconditions for every callable that reaches *another* user. |
| `social.js` | 202 | Friend requests (both sides written atomically). |
| `admobSsv.js` | 191 | Server-side ad verification — the real "was this ad watched". |
| `restBoost.js` `rewardAdView.js` | 156 / 80 | Ad → coins, ad → one-use 2× token (one exercise, 3 sets). |
| `recommendWorkout.js` `acceptRecommendation.js` | 158 / 115 | Send a routine to a friend's inbox, and take it. |
| `officialAccount.js` `welcomeFriend.js` | 144 / 61 | The app's own "Jimmy" account; everyone is auto-friended with it. |
| `mascots.js` `mascotBackfill.js` `evolution.js` `exercises.js` | 38–156 | Server twins of client data tables. |
| `nudges.js` `nudgeMessages.js` | 71 / 23 | Allow-listed nudge text — never free text into someone's push. |
| `friendSuggestions.js` `userSearch.js` `liveUsers.js` `publicName.js` `publicProfile.js` `publishRecords.js` `onboarding.js` `referral.js` `coaching.js` `accountRole.js` `account.js` `cheerNotifications.js` | | one concern each |

### Server authority model

The client may never write `coins`, `friends`, `badges`, `sharePRs`, `unlockedDances`,
`unlockedAccessories`, `lastWorkoutAt`, `role` or any username field. Those flow only
through callables, and `firestore.rules` enforces it with a diff-based allowlist.

The store catalog is **duplicated on purpose** (`src/data/storeItems.js` ↔
`functions/storeCatalog.js`) so a tampered client can never buy at its own price — the
server ignores whatever cost the client sends. Same pattern for badges, records,
exercises, mascots and nudge messages: client copy = display, server copy = truth.

---

## 5. Global State

**There is almost no global state machinery.** No Redux, Zustand, Jotai or TanStack
Query. The pattern is:

```
Firebase onSnapshot  →  custom hook  →  App.jsx  →  props
```

`App.jsx` (1685 lines) is the single composition root: it calls ~30 hooks, owns the
reward/celebration cascade, and prop-drills everything. This is deliberate at the
current size and is also the main thing to revisit before the tree gets deeper.

### The two React Contexts: `JimmyLook` and `Moderation`

`src/context/JimmyLook.jsx` publishes **only the signed-in user's** look:
`{ evolutionStage, equippedAccessories, mascot }`, consumed as
`<JimmyAvatar {...useJimmyLook()} />`.

It is scoped on purpose, and **`JimmyAvatar` is deliberately NOT context-aware**: a
leaderboard row, a feed post and a friend's profile all draw *somebody else's* goat from
data that arrives with that row. If the avatar silently fell back to "the current user",
a forgotten prop would render wrong data that looks entirely plausible (everyone quietly
wearing your hat) instead of an obvious blank.

`src/context/Moderation.jsx` is the exact mirror image, and the pair is worth reading
together: **`JimmyLook` is about you and must never be read where somebody else is
drawn; `Moderation` is about everybody else and is only ever read there.** It publishes
`{ blockedUids, blockUser, unblockUser, reportUser, openUserActions }` from
`hooks/useModeration.js`, so the ⋯ beside any name reaches them without six components
in between knowing what blocking is.

The provider also **owns the one Block/Report sheet** (`UserActionsSheet`). That is a
bug fix, not tidiness: blocking somebody from a list removes their row on the next
render, and a sheet rendered *by* that row unmounts with it — the block landed, but the
confirmation vanished, and "Report sent" (the one message a reporter needs, since
reporting alone changes nothing visible) was never readable.

### Where each piece of state lives

| State | Source |
|---|---|
| auth user, the `users/{uid}` doc (aliased `account`) | `useAuth` (703 lines) |
| `coins`, unlocks | **the same account doc** — `useEconomy` holds no state, it only calls callables |
| `evolutionStage` | **derived, never stored** — `getEvolutionProgress(lifetimeVolume(workouts))` |
| body metrics | `useCloudProfile` → `meta/profile` |
| finished workouts | `useCloudWorkouts` (one snapshot, diffed) |
| the workout in progress | `useWorkouts` — local state + localStorage, survives reload |
| friends / requests / feed / notifications | `useFriendsGraph`, `useFeed`, `useNotifications` |

### Routes

```
/  /progress  /social  /shop            ← bottom-tab routes (tabPaths.js, swipeable)
/friends/:friendUid  /profile  /history
/workout  /workouts/:id
/trainees  /trainees/:id  /trainees/:id/assign  /trainees/:id/workouts/:workoutId
/admin                                   ← rendered only when utils/appAdmin.js says so
/privacy  /terms  /support               ← OUTSIDE App, signed-out (PublicInfoRoutes)
*  → redirect to /
```

`/privacy`, `/terms` and `/support` are intercepted by `PublicInfoRoutes` **before**
`App`, because App returns `<AuthScreen/>` for every path when nobody is signed in and
those URLs are the ones given to App Store Connect.

Three screens replace the router entirely when they apply: `PendingVerificationScreen`
(unverified e-mail), `LegalConsentGate` (terms not accepted), `ForcedUsernameModal`
(`mustChangeUsername`). All three are screens, not overlays — an overlay leaves the app
reachable underneath.

---

## 6. The workout-logging domain — the delicate parts

This is where most of the subtle logic lives. Read these three files before touching a
set.

### `utils/setLoad.js` — the weight contract

- **`set.weight` is ALWAYS the absolute load in kg.** Everything downstream (scoring,
  volume, PRs, the leaderboard) reads only this.
- A **per-hand** exercise (dumbbells, cable crossover) stores the **pair** in `weight`,
  plus `perHandWeight` and `isPerHand: true` as a *format marker* so the UI can show the
  number the lifter actually typed.
- A **bodyweight** exercise stores belt weight in `addedWeight`; the server folds in
  `bodyWeightAtLog`.
- Legacy sets without the marker are left alone deliberately, and read back as the total
  they were scored as.
- ⚠️ **`deriveWeight` precedence hazard (server, `functions/economy.js`):** the server
  prefers a valid `barWeight`/`weightPerSide` pair over `weight` — it must, for
  un-reloaded old clients. So every client patch has to blank stale context (`NO_BAR` /
  `NOT_PER_HAND`) or a freshly typed number is silently overruled. Use the patch
  builders (`totalPatchFor`, `perHandPatchFor`, `blankLoadPatch`), never a bare
  `{ weight }`.
- The plate calculator (bar + plates per side) was **removed** and stays removed.
  `entryKindFor()` can no longer return that kind, even for a set logged with it.

### `utils/setCascade.js` — cascading entry

Editing a set's load or reps flows the same values **down** to every later set in that
exercise that is still open to them. Two rules: **down, never up**, and **a completed
set is never rewritten**. One extension, which runs **both ways**: a drop set neither
receives the cascade nor starts one (its load is a deliberate step down, and its reps
are whatever failure gave). `numberSets()` numbers working sets only — three sets with a
double drop reads `1, 2, ↳, ↳, 3`, not five sets.

### Drop sets

`+DS` on any row splices a new set immediately below it at **80 %** of the set above
(`droppedLoadFrom`), reps blank, carrying `isDropSet: true`. Pressing it on a drop row
nests another. They are ordinary sets everywhere else: counted in volume, PRs and
analytics; excluded from the overload coach, from `seedSetsFromHistory`, and from what
"+ Add Set" copies. The rest timer asks about the **next** set, so no rest before a
drop and a full rest after the last one in the chain.

### Set entry UI — wheel first, keyboard on request

`SetRow.jsx` renders **no `<input>` at all**: weight and reps are buttons showing their
number, with − / + (0.5 kg) beside the weight. Tapping one opens `SetEntrySheet.jsx`
(two `WheelPicker` dials + steppers, portalled to `document.body`). **Double-tapping a
dial** swaps that wheel in place for a numeric field, focused, and Enter/blur saves and
restores the wheel. A typed number is snapped onto the dial's own 0.5 kg ladder, or the
wheel would pull it to the nearer rung on the way back.

Two traps that cost real debugging time:
- A `filter: drop-shadow(...)` on an ancestor makes it the containing block for
  `position: fixed` descendants — which is why the sheet is portalled.
- `interactive-widget=resizes-content` in the viewport meta shrinks the *layout*
  viewport when the keyboard opens, so CSS `orientation` can flip to landscape on a
  portrait phone. `components/shared/RotateGate.jsx` therefore requires three signals to
  agree (touch + phone-sized screen, viewport ratio > 1.5, and `screen.orientation`)
  before showing the "rotate your device" gate.

### Scoring — Relative Strength Volume

`load ÷ bodyweight × reps`, summed per set. A lighter lifter ranks on the same scale as
a heavier one. This is the number behind the tier ladder, the weekly leaderboard and
`lifetimeVolume`.

```
goat   → 0      → stage 1
buff   → 400    → stage 2   (~4 workouts)
titan  → 2 000  → stage 3   (~20 workouts)
legend → 5 000  → stage 4   (~50 workouts)
```

A typical session is worth ~100 points. **Thresholds are scaled, not the score**, for
female accounts (`evolutionTiers.js`) — the same four tiers, reachable on the same
number of sessions. A **neglect penalty** drops the effective tier by one after 5 idle
days; any workout lifts it.

---

## 7. Component inventory

```
components/
├── admin/        AdminDashboard (the /admin route) · FounderConsole (presentational)
│                 AnalyticsPanel · EconomyPanel · OperationsPanel · UserActionsPanel
│                 consoleUi (cards/bars/chips) · consoleMock (metrics the DB can't answer yet)
├── auth/         AuthScreen · OnboardingFlow (588 lines, one-topic-per-screen wizard)
│                 PendingVerificationScreen · LegalConsentGate · FirebaseSetupNeeded
├── evolution/    JimmyAvatar ⭐ (paper-doll renderer, two-pass behind/front layering)
│                 JimmyAnimation (static sprite ↔ animated-WebP dance)
│                 accessoryArt (catalog id → PNG, aspect, behind-fraction) · JimmyEvolution.tsx
├── history/      HistoryList · WorkoutDetail (edit/delete a logged session)
├── layout/       BottomNav · TopHud (coin balance) · tabPaths.js
├── legal/        PublicInfoRoutes · PublicInfoPage · LegalDocument
├── profile/      ProfileView · SettingsPanel (901 lines) · WeighInModal
│                 BadgeRibbon · BadgeMedallion · BadgePickerModal (pick the 3 shown)
│                 ForcedUsernameModal · NotificationPromptModal
├── progress/     ProgressView · StreakHeatmap · WeeklyVolumeCard · LifetimeVolumeCard
│                 WeeklySummaryCard · MuscleGroupGoals · RecentWorkoutsList · StatTile
├── shared/       WheelPicker ⭐ (scroll-snap dial; BodyWeight/Date/Height/Scroll variants)
│                 BottomSheet · ConfirmDialog · Toast · GradientBorder · ErrorBoundary
│                 RotateGate (portrait lock on web) · AnnouncementBanner
│                 FounderMessageModal/Sheet · AdPlayingOverlay
├── shop/         GymShop · AdRewardCard ("need more coins?")
├── social/       SocialPage (tab shell) · Leaderboard.tsx · PublicFriendProfile ⭐ (650)
│                 SocialFeed · FeedPostCard · FriendsManager · FriendSearch
│                 FriendSuggestions · FriendManagementModal · FriendPickerModal
│                 NotificationsList/Modal · NudgeModal · SocialSheet (the header-modal shell)
│                 WorkoutInbox · JimmyWelcomeBanner
├── trainer/      TrainerDashboard · TraineeDetail · TraineeWorkoutDetail
│                 AssignWorkoutForm · ReadOnlyExerciseCard
└── workout/      ActiveWorkoutLogger ⭐ (1228) · ExerciseLogCard · SetRow · SetEntrySheet
                  WeightEntryKind · ExercisePicker · MuscleGroupPicker · ExerciseGuideSheet
                  ExerciseTipsSheet · ReorderableList · DragHandle
                  FullScreenTimer (439, rest timer read from the floor) · WorkoutTimer
                  FloatingWorkoutBar · RestAndRecover · LockerPromptModal · LockerReminderModal
                  WorkoutHome (the lobby) · StartWorkoutSheet · PlanWorkoutModal · MissionCard
                  WorkoutSummaryModal (confirm) · WorkoutCelebration (790, the victory lap)
                  AnimatedWorkoutSummary (510, canvas card) · BadgeCelebrationModal
                  SilverChest · SilverLootboxModal · SaveRoutinePrompt · SharePRsModal · QuickShare
```

### The post-workout cascade (order matters)

`WorkoutSummaryModal` (confirm) → `WorkoutCelebration` (`finishFlow.step ===
'celebration'`) → a queue of follow-up steps (`saveRoutine` → `SaveRoutinePrompt`,
`sharePRs` → `SharePRsModal`) → `BadgeCelebrationModal` → `SilverLootboxModal` (first
workout only) → `LockerReminderModal` (~90 min later, and only once `finishFlow` is
finished). `App.jsx` owns the whole cascade in one `finishFlow` state object, and every
reward modal is additionally guarded on `!activeWorkout` so nothing can fire while
someone is starting a session.

**The gate comes first.** `handleFinishWorkout` validates before it does anything else —
`firstWorkoutProblem` (`utils/validateWorkout.js`) over the reconciled payload, then a
throw that `WorkoutSummaryModal` catches and prints under the numbers. Nothing moves
until it passes: no celebration, no `logWorkout`, no `discardWorkout`. It exists because
the celebration is OPTIMISTIC — it used to start the moment "Done" was tapped, while the
callable was still in the air, so a workout the server refused got congratulated first
and corrected afterwards.

The gate is a mirror of `validateAndScoreWorkout`, not a second authority. It carries
only the checks a client can settle by itself, and it says which exercise and which set
row, which the server cannot know. Everything else — the cooldown, a spent boost token —
still comes back as a rejection and still takes the celebration down.

---

## 8. Hooks, utils, data

**hooks/** (36) — `useAuth` · `useEconomy` · `useCloudWorkouts` · `useCloudProfile` ·
`useWorkouts` · `useWorkoutTemplates` · `useWorkoutInbox` · `useWorkoutCooldown` ·
`useAssignedWorkouts` · `useExercises` · `useWeightEntryModes` · `useRestTimer` ·
`useRestBoost` · `useRewardedAd` · `useWakeLock` · `useFriendsGraph` · `useFriendProfile`
· `useFriendSearch` · `useFriendSuggestions` · `useFriendSummaries` · `useFeed` ·
`useCheers` · `useNotifications` · `useTrainerTrainees` · `useAdminAnalytics` ·
`useAdminOps` · `useAnnouncement` · `useFounderMessage` · `useLegalConsent` ·
`useTierUpCelebration` · `useLazyGoatNudge` · `useTabSwipe` · `useAnimationClock` ·
`useKeyboardInset` · `useBottomChrome` · `useReturnTo` · `useLocalStorage`

**utils/** (36) — `setLoad` ⭐ · `setCascade` ⭐ · `units` · `lastPerformance` ·
`exerciseSorting` · `workoutStats` · `personalRecords` · `leaderboard` ·
`evolutionTiers` · `volumeTiers` · `tierTheme` · `heatmap` · `streak` · `weighIn` ·
`friendPrivacy` ⭐ (the sanitization allowlist) · `danceAnimations` · `webpDuration` ·
`workoutSticker` (1912 — the transparent share PNG, ten looks) ·
`workoutSummaryScene` / `Data` / `Format` / `Timeline` · `canvas` · `motion` ·
`shareWorkout` · `restAlarm` · `restNotification` · `restPresets` · `restMessages` ·
`storeAlerts` · `formatIdleNumber` · `relativeTime` · `authErrors` · `onboarding` ·
`appAdmin` · `idle`

**data/** — `exercises` (544, the seed catalog) + `exerciseGuides` (480, description &
form cues) · `jimmyWorkouts` (349, pre-built programs) · `badges` (479) · `mascots`
(323, Jimmy/Gena) · `avatarAnchors` (186, where the body *is* per sprite) ·
`storeItems` · `restTips` (58 rest-timer facts) · `gymQuotes` · `nudgeMessages`

**config/** — `ads.js` (`USE_TEST_ADS = false` — live AdMob units, one per placement:
`coins` and `restBoost`) ·
`features.js` (`ENABLE_EMOTES = false` — dances are hidden, not removed)

**lib/** — `firebase` · `messaging` (FCM, two token paths) · `localNotifications`
(Capacitor) · `storage` (namespaced localStorage) · `splash` · `lazyNudge`

---

## 9. Tests — 88, in Node's own runner

```
tools/setLoad.test.mjs          24   the weight contract, drop sets, cascade, numbering, the reconciler
tools/validateWorkout.test.mjs  12   the finish gate — and that it agrees with the server's validator
tools/progression.test.mjs      10   evolution tiers, neglect penalty, scaled ladders
tools/moderation.test.mjs        9   block filtering, report ids, array identity
tools/deriveWeight.test.mjs      8   the server's own load derivation, weight vs stale context
tools/restBoost.test.mjs         8   one ad = one exercise, 3 doubled sets, never a set worth less
tools/badges.test.mjs            6   award logic
tools/leaderboard.test.mjs       6   weekly ranking
tools/jimmyWorkouts.test.mjs     5   the pre-built programs
```

They import the real client modules directly (`await import('../src/utils/...')`) — no
DOM, no test framework, no mocking library. `npm test` runs all nine.

Three of them reach across into `functions/` through `createRequire` and run the real
server code, because in each case the point IS what the server does:
`deriveWeight.test.mjs` pins how a submitted set becomes a load, and the last block of
`validateWorkout.test.mjs` asserts the client gate and `validateAndScoreWorkout` reach the
same verdict on every fixture, and `restBoost.test.mjs` pins `coinsFor` — the one part of
the payout an ad can move. A mirror nobody checks drifts, and a gate that has drifted
refuses workouts the server would have taken.

## 10. Dev harnesses — `dev/*.html`

Standalone Vite pages that render one screen against fixtures, so any surface can be
worked on **without a real account and without touching production data**:

```
guides.html    one ExerciseLogCard + the picker      logger.html    the full ActiveWorkoutLogger
rest.html      the rest timer                        celebration.html  the finish cascade
admin.html     the Founder Console on a fixture      settings.html  SettingsPanel
lobby.html     WorkoutHome                           recent.html    RecentWorkoutsList
leaderboard.html · friend-profile.html · consent.html · message.html · chill.html
moderation.html  every ⋯ surface at once, on an in-memory block list
rest.html        ?boost= puts the 2× offer in each of its states, incl. the set countdown
finish.html      the finish gate — each way a workout can be refused, and the order it happens in
avatar-gallery.html  every sprite × accessory combination
```

⚠️ `dev/logger.jsx` runs on uid `'dev'` and writes the same
`jimmy-goat:active-workout:dev` localStorage key the real dev session uses — it can
overwrite a draft workout. `dev/guides.html` is the safe one for set-row work.

---

## 11. Deployment

| Target | How |
|---|---|
| Web / PWA | `npx vercel --prod --scope reef14 --yes` → aliased to jimmy-the-goat.vercel.app |
| Functions + rules | `npx firebase deploy --only functions,firestore:rules --project jimmy-the-goat` |
| iOS | `npm run build:ios` then Xcode (signing, Push capability, APNs key, real AdMob id) |

Vercel's SPA rewrite means **any missing path returns 200 with index.html** — an HTTP
status is never proof that a chunk exists. To verify a deploy, read the chunk names out
of the *live* main bundle and grep their contents; local hashes differ because Vercel
builds on its own infrastructure.

`main.jsx` registers the service worker with `registerType: 'autoUpdate'` and adds an
hourly + on-visibility update check, because iOS keeps installed PWAs suspended for days
and a deploy would otherwise never be picked up.

---

## 12. Conventions worth matching

- **Comments explain *why*, not *what*** — specifically the non-obvious constraint or the
  bug that motivated the shape. This codebase is unusually heavily commented and new code
  is expected to match that density. A file typically opens with a several-paragraph
  header explaining the decision behind it.
- **Allowlist, never blocklist**, for anything crossing a privacy boundary.
- **Server-authoritative for anything with value**; client-writable only for harmless
  vanity. Any client-side "validation" is a UX nicety, never the security boundary.
- **Field presence as the visibility control**, not a flag a reader must remember to check
  (PR sharing deletes the field).
- **A `useRef` latch, not state, for in-flight guards** — three fast taps all read the same
  stale `state` from their closure and all three fire.
- **Derive during render**, not in an effect, where possible.
- **Duplicate a table across the client/server boundary rather than trust the client** —
  and say in both copies which one is the truth.
- One component per file; a file that exports both a component and a constant breaks Vite
  Fast Refresh (oxlint's `react/only-export-components` flags it).

---

## 13. Known gaps / open threads

- **Cloud Functions are deliberately behind the client on ads.** `USE_TEST_ADS = false`
  and `AD_REWARD_REQUIRES_SSV = true` are committed, but the functions deploy is being
  HELD until the iOS build is on the App Store. With the flag live both `rewardAdView`
  and `claimRestBoost` refuse, and a reward can then only arrive through AdMob's signed
  callback — which needs a real ad on a device. Every user is on the web PWA today,
  where the simulated ad claims through that callable, so deploying early takes both ad
  rewards away with nothing to replace them. Deploy functions AT the release, not before.
- **Emotes are flag-off** (`ENABLE_EMOTES = false`). All the data, clips, callables and
  server grants still exist — the flag only gates rendering.
- **Friend requests are silent.** `functions/social.js` writes no notification when a
  request arrives. Still the biggest hole in the social loop.
- **Like notifications do not coalesce** — one push per like.
- **Saved routines are never published.** `sanitizeFriendData` handles them and
  `PublicFriendProfile` renders them, but nothing writes `savedWorkouts` to
  `public/summary`, so that section is always empty.
- **No dismissal memory** for friend suggestions — dismissing is local-only.
- **`App.jsx` prop-drilling** is at the edge of comfortable at 1685 lines.
- **Buff's hoodie asset** (`hoodie-2.png`) has a pale bar across the muzzle — a known
  artifact in the source image, kept at the owner's request.
- **iOS release checklist — what is left is now only what needs an Apple account**:
  the signing team (`DEVELOPMENT_TEAM` is still unset), the APNs key uploaded to
  Firebase, the App ID given the Push Notifications capability, and the privacy
  nutrition labels filled in on App Store Connect.

  DONE in the repo: `GoogleService-Info.plist`, `PrivacyInfo.xcprivacy` (both in Copy
  Bundle Resources), `App/App.entitlements` carrying `aps-environment` and wired to
  `CODE_SIGN_ENTITLEMENTS` on both configurations, `SKAdNetworkItems` (Google's
  published list, 50 entries — re-copy it at each release, Google adds buyers),
  `ITSAppUsesNonExemptEncryption = false`, and `UIRequiredDeviceCapabilities` moved
  off the Capacitor template's `armv7` to `arm64`.

  ⚠️ Adding the entitlement means the build will fail to sign until the App ID has
  the Push capability and the profile is regenerated. `aps-environment` is
  `development` in the file on purpose — Xcode rewrites it to `production` on an App
  Store export, and hand-editing it breaks development builds.
- **Block & report: client LIVE, server enforcement waiting on the functions deploy.**
  The rules are deployed (2026-09-22), so blocking, unblocking and reporting all work
  against production today. What is not live is the outbound half —
  `assertNotBlockedBy` in `functions/guards.js` and its four call sites (nudges,
  workout recommendations, friend requests, the cheer trigger). Until functions ship,
  a blocked account can still cause a PUSH on the recipient's lock screen; the in-app
  row is filtered either way. It rides along with the release-time functions deploy.
- **"Force Next Evolve" is still in Settings** (`SettingsPanel.jsx`), marked
  TEMPORARY/TESTING ONLY by its own comment. It sits INSIDE the `{isAdmin && …}`
  block, so it never renders for a normal account — cruft to delete when the testing
  is done, not a thing users or reviewers can reach.
