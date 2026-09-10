// Same bounds the server (functions/economy.js) enforces for real — these
// are just immediate feedback so a typo doesn't get discovered only after
// tapping "Finish Workout" and having the whole thing rejected. Clamped on
// blur rather than on every keystroke so typing "25" for 250 doesn't get
// stomped down to the max the instant the "2" alone would exceed nothing
// but momentarily reads as a 1-2kg entry.
const MIN_WEIGHT_KG = 1;
const MAX_WEIGHT_KG = 250;
const MIN_REPS = 1;
const MAX_REPS = 30;

function clamp(value, min, max) {
  if (value === '') return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return String(Math.min(max, Math.max(min, n)));
}

export default function SetRow({ index, set, onChange, onToggleComplete, onRemove }) {
  return (
    <div
      className={`grid grid-cols-[auto_1fr_1fr_auto_auto] items-center gap-2 py-1.5 rounded-2xl transition ${
        set.completed ? 'bg-[var(--success)]/15' : ''
      }`}
    >
      <span className="text-sm text-neutral-500 w-5 text-center tabular-nums">{index + 1}</span>

      <input
        type="number"
        inputMode="decimal"
        placeholder="kg"
        min={MIN_WEIGHT_KG}
        max={MAX_WEIGHT_KG}
        value={set.weight}
        onChange={(e) => onChange({ weight: e.target.value })}
        onBlur={(e) => onChange({ weight: clamp(e.target.value, MIN_WEIGHT_KG, MAX_WEIGHT_KG) })}
        className="w-full bg-neutral-800 rounded-xl px-2 py-3 text-center text-base text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[var(--ember)]"
      />

      <input
        type="number"
        inputMode="numeric"
        placeholder="reps"
        min={MIN_REPS}
        max={MAX_REPS}
        value={set.reps}
        onChange={(e) => onChange({ reps: e.target.value })}
        onBlur={(e) => onChange({ reps: clamp(e.target.value, MIN_REPS, MAX_REPS) })}
        className="w-full bg-neutral-800 rounded-xl px-2 py-3 text-center text-base text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[var(--ember)]"
      />

      <button
        type="button"
        onClick={onToggleComplete}
        aria-label="Mark set complete"
        className={`w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold transition active:scale-95 ${
          set.completed ? 'bg-[var(--success)] text-white' : 'bg-neutral-800 text-neutral-500'
        }`}
      >
        ✓
      </button>

      <button
        type="button"
        onClick={onRemove}
        aria-label="Delete set"
        className="w-11 h-11 rounded-full flex items-center justify-center text-neutral-600 active:scale-95 transition"
      >
        ✕
      </button>
    </div>
  );
}
