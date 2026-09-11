import { useEffect, useRef } from 'react';
import { REST_ALARM_WAV_BASE64 } from '../../utils/restAlarmSound';

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
