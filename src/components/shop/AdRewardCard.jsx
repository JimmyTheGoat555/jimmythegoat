import { AD_REWARD_COINS } from '../../data/storeItems';
import { useRewardedAd } from '../../hooks/useRewardedAd';
import AdPlayingOverlay from '../shared/AdPlayingOverlay';

// "Need more Coins?" — the one place in this app where currency comes from
// something other than training.
//
// Sits in the Store rather than on the home screen, and that is the whole
// argument in one placement decision: this belongs next to the things
// coins BUY, not next to the button that starts a workout. An offer to
// watch a video where somebody is deciding whether to train is a different
// product than a gym app.
// `isAdmin` skips the once-a-day client cooldown so the owner can test the
// ad flow back to back. Visibility only — functions/guards.js holds the
// matching server-side exemption, and that is what actually pays out.
export default function AdRewardCard({ lastAdRewardAt = null, isAdmin = false }) {
  const { status, busy, isAdLoaded, isNative, awaitsServerReward, error, limitReached, lastReward, watchAd } =
    useRewardedAd(lastAdRewardAt, { bypass: isAdmin });
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

      {/* The stand-in ad itself — see AdPlayingOverlay for why it is
          web-only and cannot be dismissed. */}
      {busy && !isNative && (
        <AdPlayingOverlay
          rewarding={status === 'rewarding'}
          caption={`Hang tight — ${AD_REWARD_COINS} coins on the way.`}
        />
      )}
    </>
  );
}
