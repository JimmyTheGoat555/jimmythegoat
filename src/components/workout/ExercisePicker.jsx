import { useState } from 'react';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import MuscleGroupPicker from './MuscleGroupPicker';
import ExerciseGuideSheet from './ExerciseGuideSheet';

// An (i) in a ring. Inline SVG so it inherits currentColor and sits on
// the row's baseline at any size — the ℹ️ emoji is a blue square on half
// the phones out there.
function InfoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="h-[18px] w-[18px]"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

// Picking exercises — and now un-picking them.
//
// Two different "removes" live in this sheet and they are not the same
// thing, so they get different controls:
//
//   ✓  tapping an exercise you already added takes it back OUT of the
//      workout. It used to be a dead, greyed-out row, which meant fixing
//      a mis-tap involved closing the sheet, finding the card and using
//      its Remove button. The obvious tap does the obvious thing now.
//
//   ✕  on a CUSTOM exercise deletes it from your list entirely. That is a
//      catalog edit, not a workout edit, and there was no way to do it at
//      all before this — useExercises has had removeCustomExercise all
//      along with nothing calling it, so a typo'd "Bnech Press" was
//      permanent. Past workouts and templates keep their own copy of the
//      name, so deleting one never rewrites history.
//
// `removableExerciseIds` is the caller's answer to "which of the added
// ones is it SAFE to take out" — the live logger passes only exercises
// with no completed sets, so one stray tap can never bin logged work.
// Anything added but not in that list stays disabled, exactly as before.
//
// `initialGroup` is which muscle-group filter the sheet OPENS on. Absent
// for every ordinary "+ Add exercise" tap, which is why it defaults to the
// first group exactly as this always did. The abs interceptor passes
// 'core', so accepting the roast lands the lifter on core exercises
// instead of on Chest with six chips of scrolling between them and the
// thing they just agreed to do.
export default function ExercisePicker({
  exercises,
  addedExerciseIds,
  removableExerciseIds = [],
  initialGroup,
  onAdd,
  onRemove,
  onClose,
}) {
  const { muscleGroups, exercisesByGroup, addCustomExercise, removeCustomExercise } = exercises;
  // This sheet's footer holds a text field, so it is one of the few that
  // the software keyboard can bury — see the padding it feeds below.
  const keyboardInset = useKeyboardInset();
  // VALIDATED, not trusted. An id that is not one of the catalog's groups
  // would be a silent dead end: MuscleGroupPicker draws its chips from
  // MUSCLE_GROUPS, so nothing would highlight, and exercisesByGroup would
  // return only custom exercises carrying that exact string — an empty
  // sheet with no visible way back to a real filter. Falling back to the
  // first group makes a bad `initialGroup` merely ignored.
  //
  // Read once, as initial state: this sheet is unmounted when it closes
  // (see the `pickerOpen &&` guard at its call sites), so every open gets
  // a fresh initial group, and changing the prop on an OPEN sheet
  // deliberately does nothing — that would yank the filter out from under
  // whoever is using it.
  const [selectedGroup, setSelectedGroup] = useState(() =>
    muscleGroups.some((group) => group.id === initialGroup) ? initialGroup : muscleGroups[0].id,
  );
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  // Which custom exercise is asking "sure?". Inline rather than a
  // ConfirmDialog because this sheet is already a z-50 overlay, and a
  // modal on top of a modal to delete one list row is a lot of ceremony
  // for something that costs nothing to re-create.
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  // Which exercise's full entry is open in the guide sheet. The exercise
  // is kept through the close so the sheet has its text while it slides
  // out; only `open` flips.
  const [guide, setGuide] = useState({ exercise: null, open: false });
  const groupExercises = exercisesByGroup(selectedGroup);

  const handleAddCustom = (e) => {
    e.preventDefault();
    const exercise = addCustomExercise(customName, selectedGroup);
    if (exercise) {
      setCustomName('');
      setShowCustomForm(false);
      onAdd(exercise);
    }
  };

  const handleDeleteCustom = (exercise) => {
    // Out of the workout first if it happens to be in it, then out of the
    // list — the other order leaves a row in the logger referring to an
    // exercise that no longer exists in the picker.
    if (addedExerciseIds.includes(exercise.id)) onRemove?.(exercise.id);
    removeCustomExercise(exercise.id);
    setConfirmDeleteId(null);
  };

  return (
    // Two jobs, one padding value. With no keyboard up, --safe-b lifts
    // the sheet off the home indicator (index.css). With one up, the
    // measured occluded height lifts it clear of the KEYS — otherwise the
    // field being typed into, and the button that submits it, sit
    // underneath them on iOS. The max-height comes down by the same amount
    // so a taller sheet grows upward instead of off the top of the screen.
    // Both are 0 on desktop, where this is a no-op.
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      style={{ paddingBottom: keyboardInset ? `${keyboardInset}px` : 'var(--safe-b)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-neutral-950/94 border-t border-x border-white/10 rounded-t-[28px] max-h-[80vh] flex flex-col"
        style={keyboardInset ? { maxHeight: `calc(80vh - ${keyboardInset}px)` } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h2 className="text-xl font-bold text-neutral-100">Add Exercise</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 text-neutral-300"
          >
            ✕
          </button>
        </div>

        <div className="px-5">
          <MuscleGroupPicker selectedGroup={selectedGroup} onSelect={setSelectedGroup} />
        </div>

        <ul className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2">
          {groupExercises.map((exercise) => {
            const added = addedExerciseIds.includes(exercise.id);
            const removable = added && Boolean(onRemove) && removableExerciseIds.includes(exercise.id);
            const confirming = confirmDeleteId === exercise.id;

            if (confirming) {
              return (
                <li
                  key={exercise.id}
                  className="flex items-center gap-2 rounded-2xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">
                    Delete &ldquo;{exercise.name}&rdquo;?
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteCustom(exercise)}
                    className="shrink-0 rounded-lg bg-[var(--danger)] px-3 py-1.5 text-xs font-bold text-white"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="shrink-0 px-2 py-1.5 text-xs font-semibold text-neutral-400"
                  >
                    Cancel
                  </button>
                </li>
              );
            }

            return (
              <li key={exercise.id} className="flex items-center gap-2">
                <button
                  type="button"
                  // Added and safe to take out: the row stays live and the
                  // tap reverses itself. Added with sets already logged:
                  // still inert, because the alternative is losing them.
                  disabled={added && !removable}
                  onClick={() => (removable ? onRemove(exercise.id) : onAdd(exercise))}
                  aria-label={removable ? `Remove ${exercise.name} from this workout` : `Add ${exercise.name}`}
                  className={`flex min-w-0 flex-1 items-center justify-between rounded-2xl px-4 py-3.5 text-base text-left transition border ${
                    added
                      ? removable
                        ? 'bg-white/5 border-white/10 text-neutral-300'
                        : 'bg-white/5 border-white/5 text-neutral-600'
                      : 'bg-white/10 border-white/10 text-neutral-100'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{exercise.name}</span>
                    {exercise.custom && (
                      <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-white/10 text-neutral-400">
                        Custom
                      </span>
                    )}
                  </span>
                  <span
                    className="shrink-0 text-lg leading-none"
                    style={{ color: removable ? undefined : 'var(--tier-accent)' }}
                  >
                    {added ? (removable ? '−' : '✓') : '+'}
                  </span>
                </button>

                {/* The full entry, for anything that has one. Quiet on
                    purpose — a ring and a letter in the row's grey, so the
                    list reads as names and not as a page of buttons. */}
                {exercise.description && (
                  <button
                    type="button"
                    onClick={() => setGuide({ exercise, open: true })}
                    aria-label={`About ${exercise.name}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition active:scale-90"
                  >
                    <InfoIcon />
                  </button>
                )}

                {/* Catalog delete, and only ever on your own entries — the
                    built-in list is not yours to edit and a ✕ on Bench
                    Press would be a trap. */}
                {exercise.custom && (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(exercise.id)}
                    aria-label={`Delete ${exercise.name} from your exercises`}
                    className="shrink-0 h-9 w-9 rounded-full bg-white/5 text-sm text-neutral-500 transition active:scale-90"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className="px-5 pb-6 pt-1">
          {showCustomForm ? (
            <form onSubmit={handleAddCustom} className="flex gap-2 pt-2">
              <input
                autoFocus
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="New exercise name"
                className="flex-1 bg-neutral-800 rounded-xl px-3.5 py-3 text-base text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[var(--ember)]"
              />
              <button type="submit" className="bg-[var(--ember)] text-white font-semibold text-base px-5 rounded-xl">
                Add
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowCustomForm(true)}
              className="w-full pt-2 text-base font-medium text-[var(--ember)]"
            >
              + Custom exercise
            </button>
          )}

          {/* The sheet stays open across picks now (so you can add several
              in a row) — this is the explicit "I'm done" action, same job
              the ✕/backdrop already do, just impossible to miss now that
              there's no other reason the sheet would close on its own. */}
          <button type="button" onClick={onClose} className="btn-arcade w-full mt-3 py-3.5 text-base">
            Done Choosing
          </button>
        </div>
      </div>

      <ExerciseGuideSheet
        exercise={guide.exercise}
        open={guide.open}
        onClose={() => setGuide((g) => ({ ...g, open: false }))}
      />
    </div>
  );
}
