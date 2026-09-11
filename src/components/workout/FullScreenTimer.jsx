import { useEffect, useRef, useState } from 'react';
import { REST_ALARM_WAV_BASE64 } from '../../utils/restAlarmSound';
import { nextRestTip, TIP_KINDS } from '../../data/restTips';

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
function RestTipCard() {
  const [tip, setTip] = useState(() => nextRestTip(null));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const rotate = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setTip((current) => nextRestTip(current));
        setVisible(true);
      }, TIP_FADE_OUT_MS);
    }, TIP_ROTATE_MS);
    return () => clearInterval(rotate);
  }, []);

  const kind = TIP_KINDS[tip.kind] ?? TIP_KINDS.roast;

  return (
    <div className="relative w-full max-w-sm px-1">
      {/* Gold frame, deliberately unlike anything else on this screen: the
          clock owns the state colour (white/green/red), so the card needs
          its own identity or it reads as part of the countdown. The frame
          is a gradient-filled 2px padding box behind an opaque fill — the
          same trick GradientBorder uses elsewhere in the app, which is
          what makes it read as a crisp inlay rather than a glow. */}
      <div className="tip-frame relative rounded-2xl p-[2px]">
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
          </div>
        </div>
      </div>
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
}) {
  const audioRef = useRef(null);
  const hasPlayedRef = useRef(false);

  // Fire the alarm exactly once per rest period, the moment it lands on
  // zero. The hook already vibrates; this adds the sound, which is the
  // half that carries across a noisy gym.
  useEffect(() => {
    if (secondsLeft !== 0) {
      hasPlayedRef.current = false;
      return;
    }
    if (hasPlayedRef.current) return;
    hasPlayedRef.current = true;
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    // Rejects when the browser refuses autoplay — the vibration and the
    // full-screen colour change still carry it, so this must never throw
    // into the render tree.
    el.play?.().catch(() => {});
  }, [secondsLeft]);

  const accent = isOverdue ? 'var(--danger)' : isDone ? 'var(--success)' : '#ffffff';
  const label = isOverdue ? overdueMessage : isDone ? "REST'S OVER" : 'RESTING';

  return (
    <div
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-between bg-neutral-950 px-6 py-8 ${
        isOverdue ? 'animate-pulse' : ''
      }`}
    >
      {/* Preloaded so the tap that started this rest also unlocks playback —
          see restAlarmSound.js for why that matters on a locked phone. */}
      <audio ref={audioRef} src={REST_ALARM_WAV_BASE64} preload="auto" />

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
