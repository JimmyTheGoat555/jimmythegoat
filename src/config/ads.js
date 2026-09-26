// Everything about rewarded ads that you would ever want to change, in one
// file.
//
// ── GOING LIVE IS ONE FLAG ───────────────────────────────────────────────
// Flip USE_TEST_ADS to false once the app has real AdMob ad units. Nothing
// else in the codebase names an ad id.
//
// It is NOT one flag on the server. functions/storeCatalog.js carries
// AD_REWARD_REQUIRES_SSV, which has to move in the same change — see the
// note on SSV_ENABLED below.
//
// ── WHY THERE IS A WEB PATH AT ALL ───────────────────────────────────────
// AdMob is a NATIVE SDK. There is no AdMob for browsers — Google's web
// product is a different one (AdSense/H5), with different policies and a
// different integration — so a rewarded video cannot play in a browser
// tab, no matter what we write here. This app is a PWA on Vercel right
// now, which means today every single user is on the path that cannot
// show a real ad.
//
// So the hook runs the simulated flow on web and the real SDK on native,
// and the switch is automatic. The day the app is wrapped with Capacitor
// and installed from a store, real ads start playing with no code change.
// Until then the button still works, still pays out through the same
// server call, and the ad is a three-second placeholder.

// ── THE TWO PLACEMENTS ───────────────────────────────────────────────────
//
// Both are REWARDED ads, and both must stay rewarded: each pays out only
// when AdMob posts its signed server-side callback, and SSV is a
// rewarded-format feature. A plain interstitial unit dropped in here
// would not fill prepareRewardVideoAd, and even shown it would never send
// the callback that grants the reward — the ad would play and pay
// nothing, which is the worst of both.
//
//   coins      the Store's "watch for 50 coins" card
//              (components/shop/AdRewardCard.jsx → rewardAdView)
//   restBoost  the 2× offer during a rest
//              (components/workout/ActiveWorkoutLogger.jsx → claimRestBoost)
//
// Separate units rather than one shared id so AdMob reports them apart —
// fill rate and eCPM on a mid-workout ad are not the same numbers as on a
// store card, and with one id there is no way to see the difference. The
// reward a view buys is still decided by `custom_data`, never by which
// unit served it (see REST_BOOST_SSV_CUSTOM_DATA below).

// Google's official test units. SAFE to ship in beta — they are designed
// to be called from any app and always fill. Never point a build at a real
// unit id before the app is on a store, and never click your own live ads:
// both are how accounts get suspended.
//
// Both placements share Google's one test id on purpose: it is not a real
// unit and reports nothing worth telling apart.
export const TEST_AD_UNITS = {
  coins: {
    android: 'ca-app-pub-3940256099942544/5224354917',
    ios: 'ca-app-pub-3940256099942544/1712497310',
  },
  restBoost: {
    android: 'ca-app-pub-3940256099942544/5224354917',
    ios: 'ca-app-pub-3940256099942544/1712497310',
  },
};

// The real units, from the AdMob console.
//
// iOS only for now, which is the whole app: there is no android/ platform
// and no @capacitor/android dependency. The Android ids stay placeholders
// that adUnitIdFor() throws on, so adding the platform without first
// creating its units fails at the call instead of quietly not filling.
export const LIVE_AD_UNITS = {
  coins: {
    android: 'REPLACE_WITH_REAL_ANDROID_COINS_REWARDED_UNIT_ID',
    ios: 'ca-app-pub-4131887583920972/4905952057',
  },
  restBoost: {
    android: 'REPLACE_WITH_REAL_ANDROID_REST_BOOST_REWARDED_UNIT_ID',
    ios: 'ca-app-pub-4131887583920972/9723053095',
  },
};

// The placement names, so a typo is a thrown error rather than an
// undefined id that reaches the SDK as "no fill".
export const AD_PLACEMENTS = Object.freeze({ coins: 'coins', restBoost: 'restBoost' });

// THE flag. One line to go live — assuming LIVE_AD_UNITS above is filled
// in, which the guard in adUnitIdFor() will not let you forget.
export const USE_TEST_ADS = false;

// AdMob wants test mode declared to the SDK as well as through the unit
// id, so a test build never counts as an impression on a real account.
export const IS_TESTING = USE_TEST_ADS;

// DERIVED, not a second switch. Real ads mean AdMob's signed callback
// (functions/admobSsv.js) grants the reward and the app never asks for
// it; test ads mean there is no callback to wait for, so the simulated
// flow claims through the callable. One flag decides both, because a
// build where they disagree either pays twice or never pays.
//
// The server has a matching AD_REWARD_REQUIRES_SSV in
// functions/storeCatalog.js — flip that in the same change. It went true
// alongside USE_TEST_ADS = false above: the server now refuses a
// client-claimed reward and waits for the signed callback.
export const SSV_ENABLED = !USE_TEST_ADS;

export function currentPlatform() {
  // Capacitor puts this on the window inside a native shell. Read off the
  // global rather than importing @capacitor/core so the web build needs no
  // Capacitor dependency at all — see useRewardedAd.
  const platform = globalThis.Capacitor?.getPlatform?.();
  return platform === 'android' || platform === 'ios' ? platform : 'web';
}

export function isNativePlatform() {
  return globalThis.Capacitor?.isNativePlatform?.() === true;
}

// Why a rewarded ad cannot pay in a browser once SSV is on, or null when
// it can.
//
// The web path is a STAND-IN — a timer, then the same server claim the
// native path makes (useRewardedAd's watchAd). Once the server's
// AD_REWARD_REQUIRES_SSV is deployed it refuses that claim, and it is
// right to: there is no signed callback behind it and there never will
// be, because SSV is a mechanism of the AdMob SDK and the SDK is native
// only. So the honest thing to say on web is "not here", not "something
// went wrong" — which is what the card would otherwise show, in red,
// after making somebody sit through the fake ad first.
//
// Null on native, and null while SSV is off: there the stand-in still
// pays, and it is how the whole flow gets exercised in a browser.
//
// Callers pass this as `unavailableReason`, which refuses the watch
// BEFORE an ad plays and surfaces as `limitReached`. It is separate from
// the `bypass` an admin gets, so the owner can still drive the stand-in.
export function webAdFallbackReason() {
  if (!SSV_ENABLED || isNativePlatform()) return null;
  return 'Rewarded ads are only available in the iOS app.';
}

export function adUnitIdFor(placement, platform = currentPlatform()) {
  const table = (USE_TEST_ADS ? TEST_AD_UNITS : LIVE_AD_UNITS)[placement];
  // An unknown placement is a caller bug, and it is worth throwing on
  // every platform — including web, which returns null below — or it only
  // ever surfaces on a device.
  if (!table) {
    throw new Error(`Unknown ad placement "${placement}" — expected one of ${Object.keys(AD_PLACEMENTS).join(', ')}.`);
  }
  if (platform !== 'android' && platform !== 'ios') return null;
  const id = table[platform];
  // A live build still carrying the placeholder is worth failing loudly
  // for: AdMob's own error for a malformed unit id is "no fill", which
  // looks exactly like an ad that simply did not arrive.
  if (!USE_TEST_ADS && id.startsWith('REPLACE_WITH')) {
    throw new Error(`No live AdMob ${placement} unit id set for ${platform} — see src/config/ads.js`);
  }
  return id;
}

// Event names emitted by @capacitor-community/admob.
//
// VERIFIED against the installed @capacitor-community/admob v8 — all six
// below match its RewardAdPluginEvents enum exactly (the enum also adds
// AdImpression, "onRewardedVideoAdImpression", for impression-level
// revenue, which nothing here listens for).
//
// Still strings rather than `import { RewardAdPluginEvents }`, now that
// the plugin IS a dependency: importing it pulls the plugin module — and
// its registerPlugin() call — into the WEB bundle every PWA user
// downloads, to read six constants that never change between majors. The
// bridge lookup in useRewardedAd keeps the web build clear of it for the
// same reason. Re-check this list on a major version bump; a renamed
// event fails silently, by never firing.
export const REWARD_AD_EVENTS = {
  loaded: 'onRewardedVideoAdLoaded',
  failedToLoad: 'onRewardedVideoAdFailedToLoad',
  showed: 'onRewardedVideoAdShowed',
  failedToShow: 'onRewardedVideoAdFailedToShow',
  dismissed: 'onRewardedVideoAdDismissed',
  rewarded: 'onRewardedVideoAdReward',
};

// How long the web stand-in "plays" for. Native ignores this entirely.
export const SIMULATED_AD_MS = 3000;

// What a rest-timer ad carries in AdMob's `custom_data`, so the signed
// callback can tell "pay 50 coins" from "arm a 2× token" without the app
// in the reward path. Twin of functions/storeCatalog.js's
// REST_BOOST_SSV_CUSTOM_DATA — change them together or a live boost ad
// quietly pays coins instead.
export const REST_BOOST_SSV_CUSTOM_DATA = 'rest-boost';

// Must match guards.js's adReward window. The server owns the real cap;
// this only lets the UI work out, from users/{uid}.lastAdRewardAt, whether
// the button can pay before somebody sits through an ad to find out.
export const AD_REWARD_COOLDOWN_MS = 24 * 60 * 60 * 1000;
