function formatClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

// Small floating banner that pops up the moment a set is checked off,
// counting down the rest period. Renders nothing while no rest is running.
//
// Three visual states, escalating: counting down (neutral) -> just hit
// zero (green, "Rest's over!") -> sat at zero past the overdue threshold
// (red, pulsing, Jimmy's callout swapped in for the label) — see
// hooks/useRestTimer.js for exactly when each kicks in. The pulse is a
// plain Tailwind animate-pulse on the whole banner rather than a bespoke
// keyframe: this only needs to read as "more urgent," not as its own
// designed motion.
export default function RestTimer({ secondsLeft, isDone, isOverdue, overdueMessage, step, onAddTime, onDismiss }) {
  if (secondsLeft === null) return null;

  return (
    <div
      className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 border transition-colors ${
        isOverdue
          ? 'bg-[var(--danger)]/20 border-[var(--danger)]/40 animate-pulse'
          : isDone
            ? 'bg-[var(--success)]/20 border-[var(--success)]/30'
            : 'bg-neutral-900/90 border-white/10'
      }`}
    >
      <button
        type="button"
        onClick={() => onAddTime(-step)}
        aria-label={`Subtract ${step} seconds from rest`}
        className="w-11 h-11 shrink-0 rounded-full bg-neutral-700 text-neutral-100 font-semibold text-base active:scale-95 transition"
      >
        -{step}
      </button>

      <div className="flex-1 flex flex-col items-center leading-tight min-w-0">
        <span
          className={`text-xs text-center ${isOverdue ? 'text-[var(--danger)] font-semibold px-1' : 'text-neutral-500'}`}
        >
          {isOverdue ? overdueMessage : isDone ? "Rest's over!" : 'Resting'}
        </span>
        <span
          className={`text-2xl font-bold tabular-nums ${
            isOverdue ? 'text-[var(--danger)]' : isDone ? 'text-[var(--success)]' : 'text-neutral-50'
          }`}
        >
          {formatClock(secondsLeft)}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onAddTime(step)}
        aria-label={`Add ${step} seconds to rest`}
        className="w-11 h-11 shrink-0 rounded-full bg-neutral-700 text-neutral-100 font-semibold text-base active:scale-95 transition"
      >
        +{step}
      </button>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Close rest timer"
        className="w-9 h-9 shrink-0 flex items-center justify-center text-neutral-500"
      >
        ✕
      </button>
    </div>
  );
}
