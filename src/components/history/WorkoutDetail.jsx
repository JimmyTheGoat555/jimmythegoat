import { lazy, Suspense, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useReturnTo } from '../../hooks/useReturnTo';
import { useWeightEntryModes } from '../../hooks/useWeightEntryModes';
import ExerciseLogCard from '../workout/ExerciseLogCard';
import { droppedLoadFrom } from '../../utils/setLoad';
import ConfirmDialog from '../shared/ConfirmDialog';
import { workoutVolume, workoutSetCount } from '../../utils/workoutStats';

// The end-of-workout celebration, replayed for this session — see
// HistoryList for the same affordance on the list.
const WorkoutCelebration = lazy(() => import('../workout/WorkoutCelebration'));

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function WorkoutDetail({ workouts, updateWorkout, deleteWorkout }) {
  const { id } = useParams();
  // Progress's Recent list and History both link here; each says so in
  // the Link's state, and Back returns there explicitly. Never
  // history.back() — see the hook.
  const goBack = useReturnTo('/progress');
  const workout = workouts.find((w) => w.id === id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [replaying, setReplaying] = useState(false);
  // The same per-exercise "plates / per hand / total" preference the
  // logger uses, so a set reads the same way here as it did when logged.
  const entryModes = useWeightEntryModes();

  if (!workout) {
    return (
      <div className="pt-6 pb-nav flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-neutral-500">This workout wasn't found — it was probably deleted.</p>
        <button type="button" onClick={goBack} className="text-sm font-medium text-[var(--ember)]">
          ← Back
        </button>
      </div>
    );
  }

  const mutateExercises = (updater) => {
    updateWorkout(id, (current) => ({ exercises: updater(current.exercises) }));
  };

  const handleAddSet = (exerciseId) => {
    mutateExercises((exercises) =>
      exercises.map((e) => {
        if (e.exerciseId !== exerciseId) return e;
        // From the last WORKING set: a drop set's reduced load is not the
        // number to open another straight set at. Same rule as the
        // logger's addSet (hooks/useWorkouts.js).
        const last = e.sets.filter((s) => s.isDropSet !== true).at(-1) ?? e.sets.at(-1);
        return {
          ...e,
          sets: [
            ...e.sets,
            { id: crypto.randomUUID(), weight: last?.weight ?? '', reps: last?.reps ?? '', completed: true },
          ],
        };
      }),
    );
  };

  // The same insert the logger does, for a drop set somebody forgot to
  // record at the time. `completed: true` like every set added here: this
  // screen corrects a record of work that happened, it does not plan work.
  const handleAddDropSet = (exerciseId, afterSetId) => {
    mutateExercises((exercises) =>
      exercises.map((e) => {
        if (e.exerciseId !== exerciseId) return e;
        const at = e.sets.findIndex((s) => s.id === afterSetId);
        if (at === -1) return e;
        const sets = [...e.sets];
        sets.splice(at + 1, 0, {
          id: crypto.randomUUID(),
          ...droppedLoadFrom(e.sets[at], e.exerciseId, { isBodyweight: e.isBodyweight === true }),
          reps: '',
          completed: true,
          isDropSet: true,
        });
        return { ...e, sets };
      }),
    );
  };

  const handleUpdateSet = (exerciseId, setId, patch) => {
    mutateExercises((exercises) =>
      exercises.map((e) =>
        e.exerciseId === exerciseId ? { ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) } : e,
      ),
    );
  };

  const handleRemoveSet = (exerciseId, setId) => {
    mutateExercises((exercises) =>
      exercises.map((e) => (e.exerciseId === exerciseId ? { ...e, sets: e.sets.filter((s) => s.id !== setId) } : e)),
    );
  };

  const handleRemoveExercise = (exerciseId) => {
    mutateExercises((exercises) => exercises.filter((e) => e.exerciseId !== exerciseId));
  };

  const handleDeleteWorkout = () => {
    deleteWorkout(id);
    goBack();
  };

  return (
    <div className="flex flex-col gap-4 pt-6 pb-nav">
      <header className="flex items-start justify-between">
        <div>
          <button type="button" onClick={goBack} className="text-sm text-neutral-500 mb-1">
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-neutral-50">Edit Workout</h1>
          <p className="text-sm text-neutral-500 mt-0.5">{formatDate(workout.finishedAt)}</p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="text-sm font-medium text-[var(--danger)] px-2 py-1"
        >
          Delete
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-neutral-50 tabular-nums">
            {workoutVolume(workout).toLocaleString('en-US')}
          </p>
          <p className="text-sm text-neutral-500">kg volume</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-neutral-50 tabular-nums">{workoutSetCount(workout)}</p>
          <p className="text-sm text-neutral-500">sets completed</p>
        </div>
      </div>

      {/* The finish-line replay, for a session already in the books. Reads
          the stored document and nothing else — no coins, no records, no
          writes — so it is safe to open as often as you like. */}
      <button
        type="button"
        onClick={() => setReplaying(true)}
        className="flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold text-white transition active:scale-[0.98]"
        style={{
          borderColor: 'color-mix(in srgb, var(--tier-accent) 45%, transparent)',
          background: 'color-mix(in srgb, var(--tier-accent) 12%, transparent)',
          boxShadow: '0 0 22px -8px var(--tier-glow)',
        }}
      >
        <span aria-hidden="true">▶</span> Replay summary · Share
      </button>

      <div className="flex flex-col gap-3">
        {workout.exercises.map((exercise) => (
          <ExerciseLogCard
            key={exercise.exerciseId}
            exercise={exercise}
            onAddSet={() => handleAddSet(exercise.exerciseId)}
            onAddDropSet={(afterSetId) => handleAddDropSet(exercise.exerciseId, afterSetId)}
            onUpdateSet={(setId, patch) => handleUpdateSet(exercise.exerciseId, setId, patch)}
            onRemoveSet={(setId) => handleRemoveSet(exercise.exerciseId, setId)}
            onRemoveExercise={() => handleRemoveExercise(exercise.exerciseId)}
            entryMode={entryModes.modeFor(exercise.exerciseId)}
            onEntryModeChange={(mode) => entryModes.setModeFor(exercise.exerciseId, mode)}
          />
        ))}
        {workout.exercises.length === 0 && (
          <p className="text-sm text-neutral-500 text-center py-8">
            All exercises have been removed from this workout.
          </p>
        )}
      </div>

      <p className="text-sm text-neutral-600 text-center">Changes save automatically</p>

      {replaying && (
        <Suspense fallback={null}>
          <WorkoutCelebration replay workout={workout} onDone={() => setReplaying(false)} />
        </Suspense>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this workout?"
          message="This can't be undone."
          confirmLabel="Delete"
          onConfirm={handleDeleteWorkout}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
