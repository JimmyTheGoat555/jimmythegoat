# App Store Connect listing — Jimmy the Goat

Copy-paste source for the App Information and Version pages. The number
in parentheses after a field name is Apple's limit; the number in
brackets is what the text below actually measures. Re-measure if you
edit anything — Apple counts spaces, and the keyword field silently
truncates.

---

## 1. App Information (set once, applies to every version)

| Field | Value |
| --- | --- |
| **Name** (30) | `Jimmy the Goat` [14] |
| **Subtitle** (30) | `Gym Workout Log & Rest Timer` [28] |
| **Privacy Policy URL** | `https://jimmy-the-goat.vercel.app/privacy` |
| **Primary category** | Health & Fitness |
| **Secondary category** | Sports |

### Subtitle — why this one

The app's *name* carries all the personality, so the subtitle has to do
the search work: it is indexed exactly like the keyword field, and
"Jimmy the Goat" matches nothing anyone types. `Gym Workout Log & Rest
Timer` spends all 28 characters on terms people actually search.

Alternate, if you would rather the store page sound like the app than
rank for "workout log":

- `Lift, Log & Evolve Your Goat` [28] — pair it with **keyword set B** below.

---

## 2. Version Information (per release)

| Field | Value |
| --- | --- |
| **Promotional text** (170) | see below [166] |
| **Keywords** (100) | see below [98] |
| **Description** (4000) | see below [2375] |
| **Support URL** | `https://jimmy-the-goat.vercel.app/support` |
| **Marketing URL** | optional — leave blank |
| **Copyright** | `2026 Reef Ben Meir` |

### Promotional text [166]

Editable any time without a review — use it for what is new.

```
Drop sets that don't get interrupted, a rest timer that starts itself, and a goat that visibly gets stronger every time you do. No subscription, no paywalled history.
```

### Keywords — set A [98]

Pairs with the subtitle `Gym Workout Log & Rest Timer`. No word is
repeated from the name or subtitle: Apple already indexes those, and
repeating them wastes characters. No spaces after the commas — a space
counts as a character. Singular forms only; Apple matches plurals.

```
strength,lifting,tracker,dumbbell,barbell,bodybuilding,powerlifting,hypertrophy,muscle,reps,set,PR
```

### Keywords — set B [94]

Only if you pick the `Lift, Log & Evolve Your Goat` subtitle, which
leaves "gym", "workout", "rest" and "timer" unclaimed.

```
gym,workout,strength,tracker,dumbbell,barbell,bodybuilding,powerlifting,muscle,reps,rest,timer
```

### Description

Only the first ~3 lines show before "more" — the hook has to land there.

```
Your goat only grows if you do.

Jimmy the Goat is a strength-training log that stops feeling like a spreadsheet. Every set you finish feeds a mascot who is permanently, visibly changed by your training: a scrawny Goat becomes a Buff Goat, then a Titan, then a Legendary G.O.A.T. You don't grind for points. You train, and the evidence shows up on him.

A LOGGER THAT UNDERSTANDS HOW YOU ACTUALLY LIFT

Drop sets that flow
Most apps treat a drop set as just another set, then put a 90-second rest timer in your face while you're still at the rack with the weight in your hands. Not here. Add a drop under any set and it nests where it belongs. Tick it off and the app looks ahead: if the next set is a drop, no timer — you strip the weight and go, which is the entire point of a drop set. The rest only starts after the last drop in the chain.

A rest timer that knows when to show up
It starts itself the moment a real set is done, keeps counting with your phone locked, and tells you when you're up. While you wait it gives you one short, genuinely useful piece of training science — not a motivational poster.

Weight entry built for one thumb
Spin the dial to the plates you loaded. Already know the number? Double-tap and type it. No pinhead +/- buttons, no keyboard fight between sets.

AND THE PARTS THAT KEEP YOU COMING BACK

• 50 exercises, every one with a form guide — or add your own
• Bronze, Silver and Gold badges for milestones that mean something: a 100 kg bench, a 200 kg deadlift, a bodyweight press
• Automatic personal-record detection, so you find out you hit one without doing the arithmetic
• Coins for finished workouts, spent on outfits and dances for your goat. Cosmetics only — nothing is paywalled, and nothing you buy touches your numbers
• Body-weight tracking with a weigh-in day you choose
• Add friends with a code and see each other's finished sessions. Mutual only: nobody follows you without your say-so
• Connect a coach with a trainer code — they see your logged work and can send workouts your way
• Keeps working mid-workout with no signal. Your session lives on your phone until you finish it

NO NONSENSE

No subscription. No paywalled history. Your data is not for sale. Ads exist in exactly one place — an optional one you tap to watch for coins. Nothing is ever put in front of you unasked.

Train. Log it. Watch the goat change.
```

### What's New (first release)

```
First release. Log your lifts, and watch Jimmy grow into the goat you're becoming.
```

---

## 3. Image assets

### App icon — already done ✅

`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` is
**1024 × 1024, RGB, no alpha** — which is exactly what Apple requires.
Nothing to prepare.

Apple's rules, for reference if it is ever redrawn:

| Rule | Detail |
| --- | --- |
| Size | 1024 × 1024 px, exactly. No other size is uploaded — Xcode derives the rest. |
| Format | PNG, flattened, **no alpha channel at all** (a transparent icon is rejected at upload, not at review) |
| Color | sRGB or Display P3 |
| Corners | Draw it **square**. Apple applies the rounded mask — pre-rounded corners come out with dark notches |
| Content | No transparency, no drop shadow behind the icon, no border, no text you would not be able to read at 60 px |
| Safe area | Keep anything essential out of the outer ~10%; the mask eats the corners |

### Screenshots

**Apple changed this — 5.5" is dead.** Since April 2025 App Store
Connect requires **one** iPhone set, the **6.9"** one, and generates
every smaller size from it. You no longer upload 6.5" or 5.5" at all
unless you want to hand-tune them. Prepare 6.9" and stop.

| Slot | Portrait size | Status |
| --- | --- | --- |
| **iPhone 6.9"** | **1320 × 2868** (or 1290 × 2796 — both accepted) | **Required** |
| iPhone 6.5" | 1242 × 2688 or 1284 × 2778 | Optional — only to override the auto-scaled version |
| iPhone 5.5" | 1242 × 2208 | No longer accepted |
| iPad 13" | 2064 × 2752 | Only if you ship an iPad build |

Rules that actually get people rejected:

- **3 to 10 per set.** One is legal; three is the practical minimum — the first two are all most people see.
- **PNG or JPEG, RGB, no alpha.** Same transparency rule as the icon.
- **Portrait only for this app** — `RotateGate` locks it to portrait, so a landscape screenshot would misrepresent it.
- **It must be the real app.** Concept art, mockups of features that don't exist, or a screen with placeholder data is a 2.3.3 rejection. Run the app in the simulator at an iPhone 16/17 Pro Max and capture it (⌘S in Simulator gives you the exact pixel size).
- **No device frames with a fake status bar**, no "Download on the App Store" badge, no pricing, no Android hardware, no competitor names.
- Text overlays and background colour are fine and recommended — one short claim per shot.

Suggested six, in order, because the first two are the whole pitch:

1. The active workout with a drop set nested under its main set
2. The rest timer running, with a training fact on screen
3. The goat mid-evolution (Titan or Legendary)
4. Progress / PR history with a gold badge visible
5. The store with cosmetics and a coin balance
6. The friends feed

### App preview video (optional)

15–30 seconds, captured from the device, same 6.9" pixel size, up to 3
per set. Skip it for v1 — a bad one hurts more than none.

---

## 4. Still outstanding before you can submit

The console/mechanical work now lives in **`docs/ios-launch-checklist.md`** —
the APNs key, the Push Notifications capability, the deploy order and the
full TestFlight validation pass. What remains *here*, on the listing side:

- Privacy nutrition labels — they must match `/privacy`, which discloses
  AdMob, and must now also declare **Crash Data → linked to identity**,
  because `Sentry.setUser` sends the Firebase UID
- Age rating declaring user-generated content **and** ads
- 6.9" screenshots
- A **demo account** for App Review, with a populated history
- **Test that `support@jimmythegoat.fit` actually receives mail.** It is a
  registrar-level forward, not a mailbox — it fails silently, and Apple's
  reviewer does write to it.

Cleared since this list was written (verified in the repo, do not redo):
`DEVELOPMENT_TEAM`, `App.entitlements` with `aps-environment` wired into
signing, `PrivacyInfo.xcprivacy`, `SKAdNetworkItems`,
`ITSAppUsesNonExemptEncryption`, and `UIRequiredDeviceCapabilities`
(now `arm64`, was `armv7`). Block & report still needs the rules deploy,
which is Stage A of the iOS checklist.
