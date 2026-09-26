# iOS launch checklist — Jimmy the Goat

Companion to `docs/app-store-listing.md`, which holds the *text and images*
for the store. This one is the *mechanics*: the Apple and Firebase console
work, and the order to do it in.

Facts you will be asked for repeatedly, all verified against the repo:

| | |
|---|---|
| Bundle ID | `com.jimmythegoat.app` |
| Apple Team ID | `AL7598VQLX` |
| Firebase project | `jimmy-the-goat` |
| Xcode entry point | `ios/App/App.xcodeproj` — **not** a `.xcworkspace`. Capacitor 8 uses SPM; there is no Podfile. |
| Version / build | `1.0` / `1` (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`) |
| AdMob app ID | `ca-app-pub-4131887583920972~7865314006` |

---

## Already done — do not redo

These were outstanding in earlier notes and are now verified in the repo.
Listed so you don't spend an evening re-solving them:

- `DEVELOPMENT_TEAM = AL7598VQLX`, `CODE_SIGN_STYLE = Automatic`
- `App/App.entitlements` exists with `aps-environment = development`, and is
  wired in via `CODE_SIGN_ENTITLEMENTS` in both build configurations
- `GoogleService-Info.plist` present, bundle ID matches, and it is in the
  target's **Resources** build phase (present on disk is not enough)
- `AppDelegate.swift` forwards the three APNS callbacks to `NotificationCenter`
  — the plugin reads them from there and cannot see them otherwise
- `FirebaseApp.configure()` is called by the plugin itself
  (`FirebaseMessaging.swift:21`); it does **not** belong in `AppDelegate`
- `UIBackgroundModes` → `remote-notification`
- `PrivacyInfo.xcprivacy` present and referenced by the target
- `SKAdNetworkItems`, `ITSAppUsesNonExemptEncryption = false`,
  `NSUserTrackingUsageDescription`, `UIRequiredDeviceCapabilities = arm64`
- Both SSV go-live flags: `USE_TEST_ADS = false` (`src/config/ads.js:87`) and
  `AD_REWARD_REQUIRES_SSV = true` (`functions/storeCatalog.js:151`)

So push is blocked on exactly two things, and they are §1 and §2 below.

---

## 1. APNs Auth Key → Firebase

This is what unblocks the `getToken()` hang. Until it is done, iOS has no
APNS token to hand the Firebase SDK, and `getToken()` waits forever — which
is now a 15s `TimeoutError` with a readable message rather than a dead
screen, but still a failure.

### Generate the key (Apple)

1. <https://developer.apple.com/account> → **Certificates, Identifiers & Profiles**.
2. **Keys** in the left sidebar → **+**.
3. Key Name: `Jimmy the Goat APNs`.
4. Tick **Apple Push Notifications service (APNs)**.
   - If offered an Environment choice, pick **Sandbox & Production**. One key
     then covers debug builds, TestFlight and the App Store.
5. **Continue** → **Register** → **Download**.
6. **You can download the `.p8` exactly once.** Save it somewhere permanent
   and backed up before leaving the page. If you lose it you must revoke and
   reissue.
7. Note the **Key ID** — 10 characters, also in the filename
   `AuthKey_XXXXXXXXXX.p8`.

Two limits worth knowing: an account may hold **at most 2** APNs auth keys,
and one key works for every app on the account. If you already have two,
reuse one rather than creating a third.

### Upload it (Firebase)

1. Firebase Console → project **jimmy-the-goat**.
2. ⚙️ **Project settings** → **Cloud Messaging** tab.
3. Under **Apple app configuration**, find `com.jimmythegoat.app`.
4. **APNs Authentication Key** → **Upload**.
5. Pick the `.p8`, enter the **Key ID** and Team ID **`AL7598VQLX`**.
6. Upload.

Do not upload an APNs *certificate* instead — the key is the modern path,
does not expire annually, and covers both environments.

---

## 2. Push Notifications capability

The entitlement is already in the file. What is missing is the **App ID**
carrying the capability, which is what lets a provisioning profile include
it. Xcode will not fix the App ID for you on its own.

### Apple Developer Portal (the App ID)

1. **Certificates, Identifiers & Profiles** → **Identifiers**.
2. Select `com.jimmythegoat.app`.
3. In the capabilities list, tick **Push Notifications**.
4. **Save**, and confirm the warning about invalidating existing profiles —
   that invalidation is the point; the profile has to be reissued to carry
   the new entitlement.

### Xcode (the profile)

1. Open `ios/App/App.xcodeproj`.
2. Select the **App** target → **Signing & Capabilities**.
3. Confirm **Automatically manage signing** is ticked and Team is set.
4. **+ Capability** → **Push Notifications**. It may appear already present
   because the entitlements file has `aps-environment`; add it through the UI
   anyway — that is what makes Xcode request a profile that includes it.
5. Confirm **Background Modes** → **Remote notifications** is ticked.
6. Let Xcode regenerate the profile. If it sticks, Xcode →
   Settings → Accounts → **Download Manual Profiles**.

Leave `aps-environment` as `development`. Xcode rewrites it to `production`
when exporting for TestFlight/App Store. Hand-editing it breaks debug builds.

### Verify

Build to a real device (the Simulator cannot receive APNS tokens at all) and
tap **Enable Notifications**. Success is a token in **under two seconds**.
A 15-second wait ending in "could not get a push token from Apple" means one
of the two steps above has not taken effect.

---

## 3. TestFlight validation checklist

### Stage A — backend, before any build

The functions deploy has been held until now. It carries the server half of
the SSV contract, so it must land **before** a build that has
`USE_TEST_ADS = false` reaches a tester.

```bash
npx firebase deploy --only functions,firestore:rules --project jimmy-the-goat
```

- [ ] Deploy succeeds (do not pipe it through `head` — that can SIGPIPE it)
- [ ] Rules deploy confirmed — block & report fail with `permission-denied` without it
- [ ] Callback URL noted: `https://us-central1-jimmy-the-goat.cloudfunctions.net/admobRewardCallback`
      (`admobRewardCallback` is `onRequest` with no region set, so `us-central1`)

      A v2 function is backed by Cloud Run, so the deploy prints a
      *different* URL — `https://admobrewardcallback-y5zdjrv64q-uc.a.run.app`
      — and so does the console. Don't let the mismatch worry you: both
      were verified to answer 400 on 2026-09-27, so either works in AdMob.
      The `cloudfunctions.net` one is the stable alias and survives a
      redeploy; the Run hostname can change, so prefer the alias.
- [ ] Smoke test returns **400**, not 403:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://us-central1-jimmy-the-goat.cloudfunctions.net/admobRewardCallback
```

400 is our own "malformed callback" — it proves the function is reachable and
running. 403 means an IAM block and the URL is useless to AdMob, which gives
no feedback when a callback cannot be reached.

### Stage B — AdMob console

Paste the **identical** URL into **both** rewarded units. The function tells
the two rewards apart by `custom_data === 'rest-boost'`, not by unit.

- [ ] Coins — `ca-app-pub-4131887583920972/4905952057` → SSV callback URL set
- [ ] Rest Boost — `ca-app-pub-4131887583920972/9723053095` → SSV callback URL set

### Stage C — build and upload

- [ ] `npm run build:ios` (runs `vite build`, so Sentry is live in this binary)
- [ ] `SENTRY_AUTH_TOKEN` set if you want source maps uploaded; confirm the
      Sentry project slug is really `jimmy-the-goat` or the upload 404s
- [ ] Xcode → **Any iOS Device (arm64)** → Product → **Archive**
- [ ] Distribute App → App Store Connect → Upload
- [ ] Wait for processing, then confirm the build appears in TestFlight

### Stage D — on device, via TestFlight

Push and ads are the two things that cannot be tested any earlier.

- [ ] Cold launch: splash clears, no infinite spinner
- [ ] Sign out, force-quit, relaunch → **still signed out**; sign in, force-quit,
      relaunch → **still signed in** (proves the `initializeAuth` persistence array)
- [ ] `NotificationPromptModal` → Enable → prompt → Allow → modal closes, no hang
- [ ] A token document appears under `users/{uid}/fcmTokens`
- [ ] A real push arrives (trainer check-in or weigh-in nudge)
- [ ] Rest timer: start a rest, background the app, alert fires at zero
- [ ] Lazy-goat nudge schedules without error after logging a workout
- [ ] Rewarded ad — coins: watch to completion, balance increases **once**
- [ ] Rewarded ad — rest boost: `custom_data` path credits the boost
- [ ] Close the ad early → **no** credit
- [ ] `adRewardTransactions` shows one doc per payout, no duplicates
- [ ] Avatar accessories render correctly (the recut hoodie)
- [ ] Block & report both succeed (needs the rules deploy)
- [ ] Sentry receives a deliberate test crash, tagged with the right release

### Stage E — App Store Connect, before submission

- [ ] **Demo account** for App Review with a populated history — Apple will
      reject a sign-in-walled app without one
- [ ] Privacy nutrition labels matching `/privacy`, **including Crash Data →
      linked to identity**, because `Sentry.setUser` sends the Firebase UID
- [ ] Age rating declaring user-generated content **and** ads
- [ ] 6.9" screenshots
- [ ] **Send a real email to `support@jimmythegoat.fit` and confirm it arrives.**
      It is a registrar-level forward, not a mailbox, and it fails silently.
      Apple's reviewer does write to it.
- [ ] Optional: delete the "Force Next Evolve" debug block
      (`SettingsPanel.jsx:735`). It is inside the admin-only section so it is
      invisible to users and reviewers — cosmetic, not a blocker.
