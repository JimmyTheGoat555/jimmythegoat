import { useCallback, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { friendlyAuthError } from '../utils/authErrors';

// How long the stand-in "ad" runs. Replaced wholesale by the AdMob SDK's
// own load/show lifecycle when that goes in — at which point the reward
// stops being granted here at all and starts coming from AdMob's
// server-side verification callback (see functions/rewardAdView.js).
const SIMULATED_AD_MS = 3000;

// Watch a rewarded video, get coins.
//
// The shape is deliberately the same one a real SDK forces on you —
// an async call that resolves only once the view COMPLETES, and a reward
// that is asked for separately afterwards — so swapping the timeout below
// for `rewardedAd.show()` does not change a single caller.
//
// Two things this hook will not do, both on purpose:
//
//   * it never touches a coin balance itself. The callable is the only
//     writer; the balance on screen updates from the account snapshot
//     that the server write produces, so what you see is always what the
//     server actually recorded rather than an optimistic guess;
//   * it does not retry. A failed reward after a watched ad is annoying,
//     but a retry loop against a coin-granting endpoint is the sort of
//     thing that quietly turns into a faucet. The card says what
//     happened and the person can press it again.
export function useRewardedAd() {
  // 'idle' | 'playing' (the video) | 'rewarding' (the callable is out)
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  // Today's view is already claimed. Kept apart from `error` because it is
  // not one: with a cap of one a day, this is the state the card is in for
  // most of the day, and painting the normal case red teaches people to
  // ignore red. The client cannot know it in advance — `rateLimits` is
  // closed to clients by rule — so it is only ever learned by asking.
  const [limitReached, setLimitReached] = useState(false);
  const [lastReward, setLastReward] = useState(null);

  // A ref, not the status state: the guard has to be true for the SECOND
  // tap in the same tick, before any re-render could have delivered a new
  // value. Double-firing here means two reward calls for one ad.
  const inFlight = useRef(false);

  const watchAd = useCallback(async () => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setError(null);
    setLastReward(null);
    setStatus('playing');
    try {
      await new Promise((resolve) => setTimeout(resolve, SIMULATED_AD_MS));
      setStatus('rewarding');
      const { data } = await httpsCallable(functions, 'rewardAdView')({});
      setLastReward(data?.coinsAwarded ?? null);
      return data;
    } catch (err) {
      const message = friendlyAuthError(err, "Couldn't award the coins — try again.");
      // The daily cap arrives as resource-exhausted carrying the server's
      // own sentence, which is the useful thing to show either way —
      // friendlyAuthError leaves a message it does not recognise alone
      // after stripping Firebase's prefix.
      if (err?.code === 'functions/resource-exhausted') setLimitReached(message);
      else setError(message);
      return null;
    } finally {
      setStatus('idle');
      inFlight.current = false;
    }
  }, []);

  return {
    status,
    busy: status !== 'idle',
    error,
    // The server's own wording when today's view is spent; null otherwise.
    limitReached,
    lastReward,
    watchAd,
  };
}
