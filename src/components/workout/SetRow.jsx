import { useState } from 'react';
import { createPortal } from 'react-dom';
import SetEntrySheet from './SetEntrySheet';
import { formatWorkingWeight } from '../../utils/units';

const isSet = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));

function fmtReps(v) {
  return isSet(v) ? String(Math.round(Number(v))) : '—';
}

// A logged set. Weight/reps are chips that open SetEntrySheet's scroll
// wheels. For a bodyweight exercise the first chip shows "BW" (+ any belt
// weight) instead of a working weight — logWorkout folds in the lifter's
// body weight server-side. Bounds live in utils/units.js and are enforced
// again in functions/economy.js.
export default function SetRow({
  index,
  set,
  exerciseId,
  isBodyweight = false,
  lastSet,
  onChange,
  onToggleComplete,
  onRemove,
  onToggleDropSet,
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  // A bodyweight set only needs reps (the load is your body weight, added
  // by the server; belt weight defaults to 0). A weighted set needs both.
  const ready = isSet(set.reps) && (isBodyweight || isSet(set.weight));

  const chipClass =
    'w-full bg-neutral-800 rounded-xl px-2 py-3 flex flex-col items-center leading-none active:scale-[0.97] transition';

  const added = Number(set.addedWeight) || 0;
  const loadTop = isBodyweight ? (added > 0 ? `BW +${formatWorkingWeight(added)}` : 'BW') : isSet(set.weight) ? formatWorkingWeight(set.weight) : '—';
  const loadLabel = isBodyweight ? 'body' : 'kg';

  const isDrop = set.isDropSet === true;

  return (
    <div
      // A drop set is indented and rail-marked rather than recoloured: the
      // green fill already means "completed", and a second background
      // colour on the same row would put two unrelated meanings in one
      // channel. The rail reads as "hangs off the set above", which is
      // exactly what a drop set is.
      className={`grid grid-cols-[auto_1fr_1fr_auto_auto] items-center gap-2 py-1.5 rounded-2xl transition ${
        set.completed ? 'bg-[var(--success)]/15' : ''
      } ${isDrop ? 'ml-4 border-l-2 border-[var(--ember)] pl-1' : ''}`}
    >
      <button
        type="button"
        onClick={onToggleDropSet}
        // The set number doubles as the toggle. There is no room for a
        // sixth control on a 375px row — the grid is already five columns
        // and the two chips need every pixel they have — and the number
        // is the one cell that was pure decoration.
        aria-pressed={isDrop}
        aria-label={`Set ${index + 1}${isDrop ? ' — drop set, tap to make it a normal set' : ' — tap to mark as a drop set'}`}
        title={isDrop ? 'Drop set (no rest)' : 'Mark as drop set'}
        className={`w-5 h-11 text-sm tabular-nums transition active:scale-90 ${
          isDrop ? 'text-[var(--ember)] font-bold' : 'text-neutral-500'
        }`}
      >
        {isDrop ? '↓' : index + 1}
      </button>

      <button type="button" onClick={() => setSheetOpen(true)} className={chipClass} aria-label={`Set ${index + 1} weight`}>
        <span className="text-base font-semibold text-neutral-100 tabular-nums">{loadTop}</span>
        <span className="text-[10px] uppercase tracking-wide text-neutral-500 mt-0.5">{loadLabel}</span>
      </button>

      <button type="button" onClick={() => setSheetOpen(true)} className={chipClass} aria-label={`Set ${index + 1} reps`}>
        <span className="text-base font-semibold text-neutral-100 tabular-nums">{fmtReps(set.reps)}</span>
        <span className="text-[10px] uppercase tracking-wide text-neutral-500 mt-0.5">reps</span>
      </button>

      <button
        type="button"
        onClick={onToggleComplete}
        disabled={!set.completed && !ready}
        aria-label="Mark set complete"
        className={`w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold transition active:scale-95 disabled:opacity-40 disabled:active:scale-100 ${
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

      {/* Portalled to <body>: the enclosing ExerciseLogCard's `.card` has a
          filter (drop-shadow glow), which would otherwise make it the
          containing block for the sheet's `position: fixed` and trap it
          inside the card instead of covering the screen. */}
      {sheetOpen &&
        createPortal(
          <SetEntrySheet
            index={index}
            exerciseId={exerciseId}
            isBodyweight={isBodyweight}
            weight={set.weight}
            addedWeight={set.addedWeight}
            reps={set.reps}
            lastSet={lastSet}
            onChange={onChange}
            onClose={() => setSheetOpen(false)}
          />,
          document.body,
        )}
    </div>
  );
}
