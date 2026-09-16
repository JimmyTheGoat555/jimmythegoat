import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ExerciseLogCard from '../workout/ExerciseLogCard';
import ConfirmDialog from '../shared/ConfirmDialog';
import { workoutVolume, workoutSetCount } from '../../utils/workoutStats';

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
  const navigate = useNavigate();
  const workout = workouts.find((w) => w.id === id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!workout) {
    return (
      <div className="pt-6 pb-nav flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-neutral-500">This workout wasn't found — it was probably deleted.</p>
        <button type="button" onClick={() => navigate('/history')} className="text-sm font-medium text-[var(--ember)]">
          Back to History
        </button>
      </div>
    );
  }

  const mutateExercises = (updater) => {
    updateWorkout(id, (current) => ({ exercises: updater(current.exercises) }));
  };

  const handleAddSet = (exerciseId) => {
    mutateExercises((exercises) =>
      exercises.map((e) =>
        e.exerciseId === exerciseId
          ? {
              ...e,
              sets: [
                ...e.sets,
                {
                  id: crypto.randomUUID(),
                  weight: e.sets.at(-1)?.weight ?? '',
                  reps: e.sets.at(-1)?.reps ?? '',
                  completed: true,
                },
              ],
            }
          : e,
      ),
    );
  };

  const handleUpdateSet = (exerciseId, setId, patch) => {
    mutateExercises((exercises) =>
      exercises.map((e) =>
        e.exerciseId === exerciseId
          ? { ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }
          : e,
      ),
    );
  };

  const handleRemoveSet = (exerciseId, setId) => {
    mutateExercises((exercises) =>
      exercises.map((e) =>
        e.exerciseId === exerciseId ? { ...e, sets: e.sets.filter((s) => s.id !== setId) } : e,
      ),
    );
  };

  const handleRemoveExercise = (exerciseId) => {
    mutateExercises((exercises) => exercises.filter((e) => e.exerciseId !== exerciseId));
  };

  const handleDeleteWorkout = () => {
    deleteWorkout(id);
    navigate('/history');
  };

  return (
    <div className="flex flex-col gap-4 pt-6 pb-nav">
      <header className="flex items-start justify-between">
        <div>
          <button type="button" onClick={() => navigate(-1)} className="text-sm text-neutral-500 mb-1">
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-neutral-50">Edit Workout</h1>
          <p className="text-sm text-neutral-500 mt-0.5">{formatDate(workout.finishedAt)}</p>
        </div>
        <button type="button" onClick={() => setConfirmDelete(true)} className="text-sm font-medium text-[var(--danger)] px-2 py-1">
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

      <div className="flex flex-col gap-3">
        {workout.exercises.map((exercise) => (
          <ExerciseLogCard
            key={exercise.exerciseId}
            exercise={exercise}
            onAddSet={() => handleAddSet(exercise.exerciseId)}
            onUpdateSet={(setId, patch) => handleUpdateSet(exercise.exerciseId, setId, patch)}
            onRemoveSet={(setId) => handleRemoveSet(exercise.exerciseId, setId)}
            onRemoveExercise={() => handleRemoveExercise(exercise.exerciseId)}
          />
        ))}
        {workout.exercises.length === 0 && (
          <p className="text-sm text-neutral-500 text-center py-8">
            All exercises have been removed from this workout.
          </p>
        )}
      </div>

      <p className="text-sm text-neutral-600 text-center">Changes save automatically</p>

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
