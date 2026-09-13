import { useState } from 'react';
import ExercisePicker from './ExercisePicker';
import { getMuscleGroup } from '../../data/exercises';

// Build a routine without doing it — "make a workout for later".
//
// Until now a template could only come from a workout you had already
// finished, or from copying a friend's. That leaves the one case people
// actually want covered by nothing: deciding tonight what you are going
// to lift tomorrow, so the gym is only about lifting.
//
// Structure only, which is not a limitation here but the whole point — a
// template in this app has never carried sets, reps or loads (see
// useWorkoutTemplates), so a planned routine and a saved-from-history one
// are the same shape and load the same way. Nothing to reconcile.
//
// Same bottom-sheet language as NudgeModal: dark scrim, rounded sheet
// from the bottom on phones, centred card from `sm` up.
export default function PlanWorkoutModal({ exercises, onSave, onClose }) {
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const add = (exercise) => {
    setPicked((prev) =>
      // ExercisePicker already greys out what is added, but it stays open
      // for multi-select, so a double tap is easy — and a routine with the
      // same lift twice is a mistake every time.
      prev.some((e) => e.exerciseId === exercise.id)
        ? prev
        : [...prev, { exerciseId: exercise.id, name: exercise.name, muscleGroup: exercise.muscleGroup }],
    );
  };

  const remove = (exerciseId) => setPicked((prev) => prev.filter((e) => e.exerciseId !== exerciseId));

  const handleSave = () => {
    if (picked.length === 0) return;
    navigator.vibrate?.([30]);
    // The publish prompt ("show this on your profile?") is App's, fired by
    // the same path a workout-saved template takes — so a planned routine
    // gets the same one-time opt-in and can be shared exactly like any
    // other, rather than growing a second consent flow here.
    onSave(title, picked);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-neutral-950 sm:max-w-sm sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Plan a workout"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-neutral-950 px-5 pb-3 pt-5">
          <div>
            <h2 className="text-xl font-bold text-neutral-50">Plan a workout</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Line it up now. At the gym you just press start.
            </p>
          </div>
          <button type="button" onClick={onClose} className="px-1 text-2xl leading-none text-neutral-500">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Push day"
            aria-label="Routine name"
            maxLength={60}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-base text-neutral-100 placeholder:text-neutral-600 focus:border-[var(--ember)]/50 focus:outline-none"
          />

          {picked.length === 0 ? (
            <p className="py-2 text-center text-sm text-neutral-500">No exercises yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {picked.map((exercise, i) => {
                const group = getMuscleGroup(exercise.muscleGroup);
                return (
                  <li
                    key={exercise.exerciseId}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5"
                  >
                    <span className="w-4 text-center text-xs tabular-nums text-neutral-600">{i + 1}</span>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: group?.color }} />
                    <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">{exercise.name}</span>
                    <button
                      type="button"
                      onClick={() => remove(exercise.exerciseId)}
                      aria-label={`Remove ${exercise.name}`}
                      className="px-1 text-neutral-600 transition active:scale-90"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full rounded-xl border border-dashed border-white/15 py-3 text-sm font-semibold text-[var(--ember)] transition active:scale-[0.98]"
          >
            + Add exercise
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={picked.length === 0}
            className="w-full rounded-2xl bg-[var(--ember)] py-3.5 text-base font-semibold text-white transition active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
          >
            {picked.length === 0
              ? 'Add an exercise to save'
              : `Save routine · ${picked.length} exercise${picked.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {/* The same picker the live logger uses, so "what counts as an
          exercise" — including a custom one someone adds here — has one
          implementation. */}
      {pickerOpen && (
        <ExercisePicker
          exercises={exercises}
          addedExerciseIds={picked.map((e) => e.exerciseId)}
          onAdd={add}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
