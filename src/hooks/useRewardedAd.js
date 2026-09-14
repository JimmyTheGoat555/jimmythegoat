import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../lib/firebase';
import { friendlyAuthError } from '../utils/authErrors';
import {
  AD_REWARD_COOLDOWN_MS,
  IS_TESTING,
  SSV_ENABLED,
  REWARD_AD_EVENTS,
  SIMULATED_AD_MS,
  adUnitIdFor,
  currentPlatform,
  isNativePlatform,
} from '../config/ads';

// Rewarded video → coins.
//
// TWO PATHS, PICKED AUTOMATICALLY:
//
//   native (Capacitor shell)  the real AdMob SDK via
//                             @capacitor-community/admob
//   web (everything today)    a three-second stand-in
//
// The split is not a shortcut, it is the only arrangement that works:
// AdMob ships a native SDK and has no browser equivalent, and this app is
// currently a PWA. Wrapping it with Capacitor turns the real path on with
// no change here.
//
// THE PLUGIN IS REACHED THROUGH THE CAPACITOR BRIDGE, not an import:
//
//   globalThis.Capacitor.Plugins.AdMob
//
// which is how a Capacitor app exposes every registered plugin at runtime.
// That keeps @capacitor-community/admob out of the WEB build's dependency
// graph entirely — the current deploy needs no new npm package and cannot
// break on one being absent. Once you have wrapped the app and installed
// the plugin, swapping this for a normal import is a two-line change and
// buys you types; until then, an import of a package that is not there is
// a build failure on every Vercel deploy.
//
// WHAT COUNTS AS EARNED: the Rewarded event, and only that. A rewarded ad
// can be dismissed early, fail to show, or be closed after the video but
// before the reward callback — AdMob fires Dismissed in all of those, and
// paying on Dismissed would pay for closing an ad. So the reward call is
// made from the Rewarded handler and nowhere else.
// `lastAdRewardAt` is users/{uid}.lastAdRewardAt — server-written, so it
// survives a refresh and a devtools session both. Without it the card
// forgets the reward was claimed the moment the page reloads, offers the
// ad again, plays it, and only then learns from the server that it cannot
// pay: an ad watched for nothing, which is worse than a disabled button.
export function useRewardedAd(lastAdRewardAt = null) {
  // 'idle' | 'loading' (fetching an ad) | 'playing' | 'rewarding' (server)
  const [status, setStatus] = useState('idle');
  const [isAdLoaded, setIsAdLoaded] = useState(false);
  const [error, setError] = useState(null);
  // Today's view is spent. Separate from `error` because with a one-a-day
  // cap this is the ordinary state for most of the day, and painting the
  // ordinary state red teaches people to ignore red.
  const [limitReached, setLimitReached] = useState(null);
  const [lastReward, setLastReward] = useState(null);

  // Derived, not stored: the account doc is the live source, so this is
  // right again on its own the moment the cooldown lapses or another
  // device claims the reward.
  const claimedAtMs = lastAdRewardAt ? Date.parse(lastAdRewardAt) : NaN;
  const nextAvailableAt = Number.isFinite(claimedAtMs) ? claimedAtMs + AD_REWARD_COOLDOWN_MS : null;
  const onCooldown = nextAvailableAt !== null && nextAvailableAt > Date.now();

  const native = isNativePlatform();
  // A ref, not state: the guard has to hold for the SECOND tap in the same
  // tick, before any re-render could deliver a new value. Double-firing
  // here means two reward calls for one ad.
  const inFlight = useRef(false);
  // Set by the Rewarded listener, read by Dismissed — the two arrive as
  // separate events and the second one has to know what the first decided.
  const earned = useRef(false);

  const claimReward = useCallback(async () => {
    setStatus('rewarding');
    try {
      const { data } = await httpsCallable(functions, 'rewardAdView')({});
      setLastReward(data?.coinsAwarded ?? null);
      return data;
    } catch (err) {
      const message = friendlyAuthError(err, "Couldn't award the coins — try again.");
      if (err?.code === 'functions/resource-exhausted') setLimitReached(message);
      else setError(message);
      return null;
    } finally {
      setStatus('idle');
      inFlight.current = false;
    }
  }, []);

  // ── Native: initialise once, keep one ad warm ───────────────────────────
  const prepare = useCallback(async () => {
    const AdMob = globalThis.Capacitor?.Plugins?.AdMob;
    if (!AdMob) return;
    setStatus('loading');
    setIsAdLoaded(false);
    try {
      // WHO GETS PAID, decided before the ad is even fetched. AdMob sends
      // this back to the verification callback as `user_id`, and it is the
      // only thing tying a signed reward to an account — an ad shown
      // without it is an ad nobody can be credited for.
      const uid = auth.currentUser?.uid;
      if (SSV_ENABLED && uid) {
        await AdMob.setServerSideVerificationOptions({ userId: uid, customData: '' });
      }
      await AdMob.prepareRewardVideoAd({ adId: adUnitIdFor(currentPlatform()), isTesting: IS_TESTING });
      // Loaded arrives as an event, not as this promise resolving — the
      // listener below is what flips isAdLoaded.
    } catch (err) {
      setError(friendlyAuthError(err, 'No ad available right now — try again in a minute.'));
      setStatus('idle');
    }
  }, []);

  useEffect(() => {
    if (!native) {
      // Nothing to fetch: the stand-in is always "ready", so the button is
      // enabled rather than waiting forever for a load that never happens.
      setIsAdLoaded(true);
      return undefined;
    }
    const AdMob = globalThis.Capacitor?.Plugins?.AdMob;
    if (!AdMob) return undefined;

    let cancelled = false;
    const handles = [];
    const listen = async (event, handler) => {
      const handle = await AdMob.addListener(event, handler);
      if (cancelled) handle.remove?.();
      else handles.push(handle);
    };

    (async () => {
      try {
        // requestTrackingAuthorization is the iOS ATT prompt. AdMob asks
        // for it here rather than at launch so the first thing a new user
        // sees is the app, not a permission dialog about advertising.
        await AdMob.initialize({ requestTrackingAuthorization: true, initializeForTesting: IS_TESTING });
      } catch {
        // An SDK that will not start is a dead feature, not a dead app —
        // the card stays, the button stays disabled, nothing else breaks.
        return;
      }
      if (cancelled) return;

      await listen(REWARD_AD_EVENTS.loaded, () => {
        setIsAdLoaded(true);
        setStatus('idle');
      });
      await listen(REWARD_AD_EVENTS.failedToLoad, () => {
        setIsAdLoaded(false);
        setStatus('idle');
      });
      await listen(REWARD_AD_EVENTS.rewarded, () => {
        earned.current = true;
        if (SSV_ENABLED) {
          // Nothing to ask for. AdMob is calling the verification endpoint
          // right now and the coins will arrive on the account doc, which
          // the balance already reads live. Claiming here as well would be
          // the unverified path this whole mechanism exists to remove.
          setStatus('idle');
          inFlight.current = false;
          return;
        }
        claimReward();
      });
      await listen(REWARD_AD_EVENTS.failedToShow, () => {
        setStatus('idle');
        inFlight.current = false;
        prepare();
      });
      await listen(REWARD_AD_EVENTS.dismissed, () => {
        setIsAdLoaded(false);
        // Closed early: no Rewarded event, so no coins. Deliberately
        // silent — "you closed it" is not news, and an error-coloured
        // line for a choice the user made reads as a malfunction.
        if (!earned.current) {
          setStatus('idle');
          inFlight.current = false;
        }
        earned.current = false;
        // Warm the next one straight away; a rewarded ad that has to be
        // fetched at tap time is a button that does nothing for a second.
        prepare();
      });

      if (!cancelled) prepare();
    })();

    return () => {
      cancelled = true;
      handles.forEach((h) => h.remove?.());
    };
  }, [native, claimReward, prepare]);

  const watchAd = useCallback(async () => {
    if (inFlight.current) return null;
    // Refuse before the ad plays rather than after the server says no.
    if (onCooldown) return null;
    inFlight.current = true;
    setError(null);
    setLastReward(null);

    if (native) {
      const AdMob = globalThis.Capacitor?.Plugins?.AdMob;
      if (!AdMob || !isAdLoaded) {
        inFlight.current = false;
        return null;
      }
      setStatus('playing');
      try {
        // Resolves when the ad closes. The REWARD does not come from here
        // — the Rewarded listener above owns that, because this promise
        // resolves just as happily for an ad somebody skipped.
        await AdMob.showRewardVideoAd();
      } catch (err) {
        setError(friendlyAuthError(err, "Couldn't play the ad — try again."));
        setStatus('idle');
        inFlight.current = false;
        prepare();
      }
      return null;
    }

    // Web stand-in. Same shape as the native path: the "view" completes,
    // then the reward is claimed through the identical server call.
    setStatus('playing');
    await new Promise((resolve) => setTimeout(resolve, SIMULATED_AD_MS));
    return claimReward();
  }, [native, isAdLoaded, claimReward, prepare, onCooldown]);

  return {
    status,
    busy: status !== 'idle',
    // True when there is an ad ready to show. Always true on web, where
    // there is nothing to fetch.
    isAdLoaded,
    isNative: native,
    // True when the reward arrives out of band (AdMob → server), so the
    // card can say "on its way" instead of showing a receipt it will
    // never get.
    awaitsServerReward: native && SSV_ENABLED,
    error,
    // Today's view is spent — either because the server just said so, or
    // because the account doc records a claim inside the window. Same
    // fact, two sources; the second is the one that survives a refresh,
    // which is the whole point of mirroring lastAdRewardAt.
    limitReached:
      limitReached ?? (onCooldown ? "You've claimed today's ad reward — come back tomorrow for the next one." : null),
    nextAvailableAt,
    lastReward,
    watchAd,
  };
}
