import { useCallback, useEffect, useRef, useState } from 'react';
import { nextRestTip, TIP_KINDS } from '../../data/restTips';
import { REST_BOOST_MULTIPLIER } from '../../data/storeItems';
import { REST_BOOST_OFFER_MIN_SECONDS } from '../../hooks/useRestBoost';

// The rest timer, sized to be read from the floor. Replaces the little
// banner that used to sit in ActiveWorkoutLogger's footer — field testing
// was blunt about it: a phone on a bench two metres away, the lifter
// standing over it, and a 24px countdown nobody could see or would notice
// ending.
//
// So: full-screen, one enormous tabular-nums clock, and touch targets big
// enough to hit without crouching. The colour does the state-reading work
// from a distance — neutral while counting, green the moment it's up, red
// once it has been sitting at zero long enough that Jimmy has opinions.
//
// The countdown itself is NOT owned here. hooks/useRestTimer derives it
// from one absolute `endsAt` timestamp, which is what makes it survive the
// screen locking (a per-second decrement silently loses time whenever
// mobile throttles the interval). This component is the face of that hook,
// nothing more.
//
// `onMinimize` vs `onSkip` is a deliberate distinction: skipping ENDS the
// rest, minimising only hides this overlay and leaves the clock running,
// so someone who wants to adjust the next set's weight mid-rest isn't
// forced to throw the timer away to get at their workout. ActiveWorkoutLogger
// re-expands automatically when the rest actually ends, so minimising can
// never cause the missed-alarm problem this redesign exists to fix.

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const QUICK_STEP = 15;
const TIP_ROTATE_MS = 15000;
const TIP_FADE_OUT_MS = 280; // must match .tip-exit's duration in index.css

// The "staring blankly at the wall" fix: a tip card under the clock that
// swaps every 15 seconds, so a 90-second rest gives you about six things
// worth reading instead of one static screen.
//
// The swap is out-then-in rather than a cross-dissolve (framer-motion's
// AnimatePresence mode="wait", built here in CSS — see index.css's tip-in/
// tip-out, and ReorderableList for why this project doesn't pull in an
// animation library). Swapping the text only while the card is invisible
// is what keeps a tip from ever being caught mid-change.
// A finger tapping a surface. Inline SVG rather than an emoji (👆 renders
// as a wildly different weight and skin tone per platform, and this sits
// at 9px next to uppercase text where that reads as a glitch).
function TapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
      <path d="M12 11V6a2 2 0 0 0-4 0v9" />
      <path d="M8 13.5 6.3 15a2 2 0 0 0-.3 2.5l2.2 3.3a3 3 0 0 0 2.5 1.2h4.4a4 4 0 0 0 4-3.6l.4-4.3a2 2 0 0 0-2-2.1H12" />
    </svg>
  );
}

function RestTipCard() {
  const [tip, setTip] = useState(() => nextRestTip(null));
  const [visible, setVisible] = useState(true);
  // Bumping this restarts the rotation effect below, which is the whole
  // mechanism behind "a tap buys you a fresh 15 seconds": the effect's
  // cleanup clears the running interval and a new one starts from now.
  // A counter rather than a timestamp because it only ever has to CHANGE,
  // and two taps inside the same millisecond would give the same Date.now().
  const [rotationEpoch, setRotationEpoch] = useState(0);
  // Guards the fade. Without it, tapping during the 280ms fade-out queues a
  // second swap behind the first, and the card visibly flickers through two
  // tips on one tap.
  const swappingRef = useRef(false);

  const swapTip = useCallback(() => {
    if (swappingRef.current) return;
    swappingRef.current = true;
    setVisible(false);
    setTimeout(() => {
      setTip((current) => nextRestTip(current));
      setVisible(true);
      swappingRef.current = false;
    }, TIP_FADE_OUT_MS);
  }, []);

  // A tap advances immediately AND resets the clock, so the tip you just
  // asked for gets the full reading time rather than whatever was left of
  // the interval you interrupted — which, tapping at second 14, would have
  // been a single second.
  const handleTap = () => {
    swapTip();
    setRotationEpoch((n) => n + 1);
  };

  useEffect(() => {
    const rotate = setInterval(swapTip, TIP_ROTATE_MS);
    return () => clearInterval(rotate);
  }, [swapTip, rotationEpoch]);

  const kind = TIP_KINDS[tip.kind] ?? TIP_KINDS.roast;

  return (
    <div className="relative w-full max-w-sm px-1">
      {/* Gold frame, deliberately unlike anything else on this screen: the
          clock owns the state colour (white/green/red), so the card needs
          its own identity or it reads as part of the countdown. The frame
          is a gradient-filled 2px padding box behind an opaque fill — the
          same trick GradientBorder uses elsewhere in the app, which is
          what makes it read as a crisp inlay rather than a glow. */}
      {/* The whole card is the tap target, not just the text — it is a
          card-sized thing on a screen designed to be hit without
          crouching, and a text-only hit area would be the one small
          target here. `type="button"` matters: this sits inside the
          workout screen's markup and a default submit would be a
          surprise. */}
      <button
        type="button"
        onClick={handleTap}
        aria-label="Show another gym fact"
        className="tip-frame relative block w-full cursor-pointer rounded-2xl p-[2px] text-left transition-transform duration-150 active:scale-[0.98] motion-reduce:active:scale-100 sm:hover:scale-[1.01]"
      >
        <div className="relative overflow-hidden rounded-[14px] bg-neutral-950 px-5 py-4">
          {/* Warm vignette behind the text, tinted to the tip's category —
              enough to feel lit from within, far too subtle to hurt
              legibility. */}
          <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-500"
            style={{ background: `radial-gradient(120% 90% at 50% 0%, ${kind.accent}22, transparent 70%)` }}
          />

          {/* Four corner ornaments — the small detail that separates a
              "card with a border" from something that looks printed. */}
          {[
            'left-1.5 top-1.5 border-l border-t',
            'right-1.5 top-1.5 border-r border-t',
            'left-1.5 bottom-1.5 border-b border-l',
            'right-1.5 bottom-1.5 border-b border-r',
          ].map((pos) => (
            <span
              key={pos}
              className={`pointer-events-none absolute h-2.5 w-2.5 ${pos}`}
              style={{ borderColor: 'rgba(212,175,55,0.55)' }}
            />
          ))}

          <div className="relative flex flex-col items-center">
            {/* Category badge. Always gold-framed for card identity, but
                tinted to the kind, so you can tell at a glance whether
                you're being taught something or insulted. */}
            <span
              key={kind.label}
              className={`mb-2.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.22em] ${
                visible ? 'tip-enter' : 'tip-exit'
              }`}
              style={{
                color: kind.accent,
                borderColor: `${kind.accent}55`,
                background: `${kind.accent}12`,
              }}
            >
              <span aria-hidden="true">{kind.icon}</span>
              {kind.label}
            </span>

            {/* min-height holds the card steady across tips of different
                lengths, so the controls below never jump mid-rest. */}
            <p
              key={tip.text}
              className={`flex min-h-[3.75rem] items-center justify-center text-balance text-center text-[15px] font-medium leading-snug text-neutral-200 ${
                visible ? 'tip-enter' : 'tip-exit'
              }`}
            >
              {tip.text}
            </p>

            {/* The affordance. Deliberately quiet — the card is a thing you
                read, not a button you are being asked to press, so the cue
                sits under the text at badge weight and says what a tap
                does rather than shouting that one is possible. Dims while
                the card is mid-swap so it does not sit there statically
                over fading text. */}
            <span
              className="mt-2.5 inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-600 transition-opacity duration-200"
              style={{ opacity: visible ? 1 : 0.3 }}
              aria-hidden="true"
            >
              <TapIcon />
              Tap for another
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}

// The rest-timer ad offer — see hooks/useRestBoost.js for the state it
// draws and functions/restBoost.js for what a boost actually is.
//
// Opt-in and quiet by design: one row under the tip card, in the gold the
// app already uses for coins, never a modal and never between the lifter
// and the controls. Three states, and only three:
//
//   * a button, while there is time to take it — at least
//     REST_BOOST_OFFER_MIN_SECONDS on the clock and nothing armed yet;
//   * an "armed" chip once a token is waiting, held for the rest of the
//     countdown so the lifter knows the next exercise pays double;
//   * nothing, once the window has closed or today's boosts are spent —
//     an offer that cannot be taken is not greyed out, it is gone.
//
// Watching does NOT pause the clock. On web the stand-in ad is an overlay
// ActiveWorkoutLogger draws above this screen (AdPlayingOverlay) while
// useRestTimer keeps counting off its absolute end time underneath; on
// native the AdMob overlay does the same. The offer's own copy says so —
// a lifter deciding whether to tap it should know the rest is not being
// extended for them.
function RestBoostOffer({ offer, secondsLeft, isDone }) {
  if (!offer) return null;

  if (offer.armed) {
    return (
      <div
        className="w-full max-w-sm rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-center"
        role="status"
      >
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-300">
          ⚡ {REST_BOOST_MULTIPLIER}× coins armed
        </p>
        <p className="mt-0.5 text-xs text-amber-200/70">Lands on the next exercise you log a set in.</p>
      </div>
    );
  }

  if (offer.busy) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-center" role="status">
        <p className="text-sm font-semibold text-neutral-300">🎬 Watching ad…</p>
        <p className="mt-0.5 text-xs text-neutral-500">The clock keeps running.</p>
      </div>
    );
  }

  // The urgency rule. Once the rest is under a minute the offer is simply
  // not there — not disabled, not explained — because the screen is about
  // to become an alarm and nothing else deserves the space.
  const windowOpen = !isDone && secondsLeft >= REST_BOOST_OFFER_MIN_SECONDS;
  if (!windowOpen) return null;
  if (!offer.available) {
    return offer.error ? (
      <p className="w-full max-w-sm text-center text-xs text-[var(--danger)]">{offer.error}</p>
    ) : null;
  }

  return (
    <div className="w-full max-w-sm">
      <button
        type="button"
        onClick={offer.onWatch}
        className="w-full rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-center transition active:scale-[0.98]"
      >
        <span className="block text-sm font-bold text-amber-300">
          🎬 Watch an ad · {REST_BOOST_MULTIPLIER}× coins on your next exercise
        </span>
        <span className="mt-0.5 block text-[11px] text-amber-200/60">
          Optional. Offer closes at 1:00 — the clock keeps running.
        </span>
      </button>
      {offer.error && <p className="mt-1.5 text-center text-xs text-[var(--danger)]">{offer.error}</p>}
    </div>
  );
}

export default function FullScreenTimer({
  secondsLeft,
  isDone,
  isOverdue,
  overdueMessage,
  onAddTime,
  onSkip,
  onMinimize,
  // { armed, available, busy, error, onWatch } from ActiveWorkoutLogger,
  // or null on a screen with no offer to make. See RestBoostOffer.
  boostOffer = null,
}) {
  // No audio here any more. The alarm — sound, vibration and the
  // system notification — all belong to useRestTimer, which owns the one
  // absolute `endsAt` that decides when the rest is actually over. This
  // component used to hold a second, independent trigger on a preloaded
  // <audio> element; that element is what took over the phone's media
  // session and paused the lifter's music. See utils/restAlarm.js.

  const accent = isOverdue ? 'var(--danger)' : isDone ? 'var(--success)' : '#ffffff';
  const label = isOverdue ? overdueMessage : isDone ? "REST'S OVER" : 'RESTING';

  return (
    <div
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-between bg-neutral-950 px-6 py-8 ${
        isOverdue ? 'animate-pulse' : ''
      }`}
    >
      {/* A wash of the state colour behind the clock, so the screen reads
          as "done" from across the gym even before the digits resolve. */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: isDone ? 0.22 : 0.08,
          background: `radial-gradient(circle at 50% 42%, ${accent}, transparent 62%)`,
        }}
      />

      <div className="relative flex w-full max-w-md items-center justify-between">
        <span className="text-sm font-bold uppercase tracking-[0.25em] text-white/45">Rest</span>
        <button
          type="button"
          onClick={onMinimize}
          className="rounded-full px-4 py-2 text-sm font-semibold text-white/55 active:scale-95"
        >
          Back to workout
        </button>
      </div>

      <div className="relative flex flex-col items-center">
        <p
          className="mb-1 max-w-xs text-balance text-center text-base font-extrabold uppercase tracking-[0.2em]"
          style={{ color: accent }}
        >
          {label}
        </p>
        {/* The whole point of the redesign. The vw figure is measured, not
            guessed: at font-size F this font renders "00:00" about 2.9F
            wide, so anything above ~30vw clips the leading and trailing
            digits off a 375px phone — which the first cut of this did.
            29vw leaves a margin at 320px and still fills the screen, and
            the rem cap keeps it sane on a tablet. tabular-nums so the
            digits don't jitter as they count down. */}
        <p
          className="font-extrabold leading-none tabular-nums"
          style={{
            color: accent,
            fontSize: 'clamp(4rem, 29vw, 11rem)',
            textShadow: `0 0 46px ${accent}55`,
          }}
        >
          {formatClock(secondsLeft)}
        </p>
      </div>

      <RestTipCard />

      <RestBoostOffer offer={boostOffer} secondsLeft={secondsLeft} isDone={isDone} />

      <div className="relative flex w-full max-w-md flex-col gap-3">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onAddTime(-QUICK_STEP)}
            className="flex-1 rounded-3xl bg-white/10 py-7 text-3xl font-extrabold tabular-nums text-white active:scale-95"
          >
            −{QUICK_STEP}s
          </button>
          <button
            type="button"
            onClick={() => onAddTime(QUICK_STEP)}
            className="flex-1 rounded-3xl bg-white/10 py-7 text-3xl font-extrabold tabular-nums text-white active:scale-95"
          >
            +{QUICK_STEP}s
          </button>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="w-full rounded-3xl py-7 text-2xl font-extrabold uppercase tracking-wide text-neutral-950 active:scale-[0.98]"
          style={{ background: accent }}
        >
          {isDone ? "Let's go" : 'Skip rest'}
        </button>
      </div>
    </div>
  );
}
