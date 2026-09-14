// Everything about rewarded ads that you would ever want to change, in one
// file.
//
// ── GOING LIVE IS ONE FLAG ───────────────────────────────────────────────
// Flip USE_TEST_ADS to false once the app has real AdMob ad units. Nothing
// else in the codebase names an ad id.
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

// Google's official test units. SAFE to ship in beta — they are designed
// to be called from any app and always fill. Never point a build at a real
// unit id before the app is on a store, and never click your own live ads:
// both are how accounts get suspended.
export const TEST_REWARDED_AD_UNITS = {
  android: 'ca-app-pub-3940256099942544/5224354917',
  ios: 'ca-app-pub-3940256099942544/1712497310',
};

// Your real units, from the AdMob console, once the app is listed.
export const LIVE_REWARDED_AD_UNITS = {
  android: 'REPLACE_WITH_REAL_ANDROID_REWARDED_UNIT_ID',
  ios: 'REPLACE_WITH_REAL_IOS_REWARDED_UNIT_ID',
};

// THE flag. One line to go live — assuming LIVE_REWARDED_AD_UNITS above is
// filled in, which the guard in adUnitIdFor() will not let you forget.
export const USE_TEST_ADS = true;

// AdMob wants test mode declared to the SDK as well as through the unit
// id, so a test build never counts as an impression on a real account.
export const IS_TESTING = USE_TEST_ADS;

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

export function adUnitIdFor(platform = currentPlatform()) {
  if (platform !== 'android' && platform !== 'ios') return null;
  const units = USE_TEST_ADS ? TEST_REWARDED_AD_UNITS : LIVE_REWARDED_AD_UNITS;
  const id = units[platform];
  // A live build still carrying the placeholder is worth failing loudly
  // for: AdMob's own error for a malformed unit id is "no fill", which
  // looks exactly like an ad that simply did not arrive.
  if (!USE_TEST_ADS && id.startsWith('REPLACE_WITH')) {
    throw new Error(`No live AdMob rewarded unit id set for ${platform} — see src/config/ads.js`);
  }
  return id;
}

// Event names emitted by @capacitor-community/admob.
//
// These are the string values of the package's own RewardAdPluginEvents
// enum. They are duplicated here so this file builds with the plugin NOT
// installed (which is the state the web app is in). Once you have run the
// install, the better move is to delete this object and import the enum:
//
//   import { RewardAdPluginEvents } from '@capacitor-community/admob';
//
// — then a version bump that renames an event breaks the build instead of
// silently never firing. Check these against the installed package the
// first time you run on a device.
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

// Must match guards.js's adReward window. The server owns the real cap;
// this only lets the UI work out, from users/{uid}.lastAdRewardAt, whether
// the button can pay before somebody sits through an ad to find out.
export const AD_REWARD_COOLDOWN_MS = 24 * 60 * 60 * 1000;
