import { useState } from 'react';
import MuscleGroupPicker from './MuscleGroupPicker';

export default function ExercisePicker({ exercises, addedExerciseIds, onAdd, onClose }) {
  const { muscleGroups, exercisesByGroup, addCustomExercise } = exercises;
  const [selectedGroup, setSelectedGroup] = useState(muscleGroups[0].id);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md bg-neutral-950/94 border-t border-x border-white/10 rounded-t-[28px] max-h-[80vh] flex flex-col"
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
            return (
              <li key={exercise.id}>
                <button
                  type="button"
                  disabled={added}
                  onClick={() => onAdd(exercise)}
                  className={`w-full flex items-center justify-between rounded-2xl px-4 py-3.5 text-base text-left transition border ${
                    added
                      ? 'bg-white/5 border-white/5 text-neutral-600'
                      : 'bg-white/10 border-white/10 text-neutral-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {exercise.name}
                    {exercise.custom && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/10 text-neutral-400">
                        Custom
                      </span>
                    )}
                  </span>
                  <span className="text-lg leading-none" style={{ color: 'var(--tier-accent)' }}>
                    {added ? '✓' : '+'}
                  </span>
                </button>
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
              <button
                type="submit"
                className="bg-[var(--ember)] text-white font-semibold text-base px-5 rounded-xl"
              >
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
    </div>
  );
}
