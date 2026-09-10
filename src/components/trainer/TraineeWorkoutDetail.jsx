import { useNavigate, useParams } from 'react-router-dom';
import { useReadOnlyWorkouts } from '../../hooks/useCloudWorkouts';
import { useTrainerTrainees } from '../../hooks/useTrainerTrainees';
import { workoutVolume, workoutSetCount } from '../../utils/workoutStats';
import ReadOnlyExerciseCard from './ReadOnlyExerciseCard';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// A trainer's full drill-down into one trainee's logged workout — every
// exercise, every set, exactly as the trainee entered it. Read-only: a
// coach looks, never edits.
export default function TraineeWorkoutDetail({ profile }) {
  const { traineeId, workoutId } = useParams();
  const navigate = useNavigate();
  const { roster } = useTrainerTrainees(profile.id);
  const { workouts, loading } = useReadOnlyWorkouts(traineeId);

  const trainee = roster.find((t) => t.id === traineeId);
  const workout = workouts.find((w) => w.id === workoutId);

  if (loading) {
    return <p className="text-sm text-neutral-500 text-center py-24">Loading…</p>;
  }

  if (!workout) {
    return (
      <div className="pt-6 pb-24 flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-neutral-500">This workout wasn't found.</p>
        <button
          type="button"
          onClick={() => navigate(`/trainees/${traineeId}`)}
          className="text-sm font-medium text-[var(--ember)]"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pt-6 pb-24">
      <div>
        <button
          type="button"
          onClick={() => navigate(`/trainees/${traineeId}`)}
          className="text-sm text-neutral-500 mb-1"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-neutral-50">{trainee?.displayName ?? 'Workout'}</h1>
        <p className="text-sm text-neutral-500 mt-0.5">{formatDate(workout.finishedAt)}</p>
      </div>

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
          <ReadOnlyExerciseCard key={exercise.exerciseId} exercise={exercise} />
        ))}
      </div>
    </div>
  );
}
