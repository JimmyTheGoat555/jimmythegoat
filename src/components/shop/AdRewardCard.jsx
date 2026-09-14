import { AD_REWARD_COINS } from '../../data/storeItems';
import { useRewardedAd } from '../../hooks/useRewardedAd';

// "Need more Coins?" — the one place in this app where currency comes from
// something other than training.
//
// Sits in the Store rather than on the home screen, and that is the whole
// argument in one placement decision: this belongs next to the things
// coins BUY, not next to the button that starts a workout. An offer to
// watch a video where somebody is deciding whether to train is a different
// product than a gym app.
export default function AdRewardCard({ lastAdRewardAt = null }) {
  const { status, busy, isAdLoaded, isNative, awaitsServerReward, error, limitReached, lastReward, watchAd } =
    useRewardedAd(lastAdRewardAt);
  // Fetching an ad is a real state on native and a non-state on web (where
  // there is nothing to fetch and isAdLoaded is always true), so the
  // button only ever shows "Loading ad…" where it means something.
  // `status === 'loading'` is the fetch in progress; the second clause
  // catches the after-a-failed-load state, where nothing is in flight and
  // there is still no ad to show.
  const fetching = isNative && !isAdLoaded && (status === 'loading' || !busy);

  return (
    <>
      <section className="card flex items-center gap-4 p-5">
        <span aria-hidden="true" className="text-3xl leading-none">
          🎬
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-neutral-50">Need more Coins?</h2>
          <p className="mt-0.5 text-xs leading-snug text-neutral-400">
            Watch a quick sponsor video to earn {AD_REWARD_COINS} Gold Coins. Once a day.
          </p>

          <button
            type="button"
            onClick={watchAd}
            // Three reasons to be off, in order of how long they last:
            // an ad is playing, today's reward is already claimed (until
            // tomorrow), or there is no ad loaded yet to show.
            disabled={busy || Boolean(limitReached) || !isAdLoaded}
            className="mt-3 w-full rounded-2xl bg-[var(--ember)] py-3 text-sm font-bold text-white transition active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
          >
            {/* Order is the message: what is happening right now beats
                what is true all day, which beats the resting label. The
                cap outranks "loading" because an ad loading behind a
                reward you cannot claim is not worth announcing. */}
            {status === 'playing'
              ? 'Watching Ad…'
              : status === 'rewarding'
                ? 'Adding coins…'
                : limitReached
                  ? 'Come back tomorrow'
                  : fetching
                    ? 'Loading ad…'
                    : `▶ Watch Ad (Get ${AD_REWARD_COINS} Coins)`}
          </button>

          {/* The balance in the HUD updates itself from the account
              snapshot the server write produces, so this line is a
              receipt rather than the number — no optimistic total to
              disagree with the real one a moment later. */}
          {lastReward !== null && !error && (
            <p className="mt-2 text-xs font-semibold text-[var(--success)]">🪙 +{lastReward} coins added!</p>
          )}
          {/* With verification on, nothing here confirms the payout — the
              balance in the HUD does, when AdMob's callback lands a moment
              later. Saying "on its way" beats a receipt that never comes. */}
          {awaitsServerReward && status === 'idle' && lastReward === null && !limitReached && !error && (
            <p className="mt-2 text-[11px] text-neutral-500">Rewards are verified by AdMob and land within a few seconds.</p>
          )}
          {/* Amber, not red: "you already had today's" is the ordinary
              state of a once-a-day reward, not a failure. */}
          {limitReached && <p className="mt-2 text-xs text-amber-300">{limitReached}</p>}
          {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}
        </div>
      </section>

      {/* WEB ONLY. On native the AdMob SDK draws its own full-screen ad
          over the app and this would sit uselessly behind it.

          Full screen and NOT dismissible, because a rewarded ad is not:
          closing it early is exactly the case where a real SDK pays
          nothing, and a fake one that can be tapped away in half a second
          would teach the wrong habit before the real thing lands. */}
      {busy && !isNative && (
        <div
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-neutral-950/97 px-6"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true" className="text-5xl leading-none">
            🎬
          </span>
          <p className="text-xl font-bold text-neutral-50">
            {status === 'rewarding' ? 'Adding your coins…' : 'Watching Ad…'}
          </p>
          <p className="text-sm text-neutral-500">
            {status === 'rewarding' ? 'One moment.' : `Hang tight — ${AD_REWARD_COINS} coins on the way.`}
          </p>
          <span aria-hidden="true" className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-white/10">
            <span className="block h-full w-full origin-left animate-[ad-progress_3s_linear_forwards] bg-[var(--ember)]" />
          </span>
        </div>
      )}
    </>
  );
}
