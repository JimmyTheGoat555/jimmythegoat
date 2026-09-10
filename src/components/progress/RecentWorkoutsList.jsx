import { Link } from 'react-router-dom';
import { getMuscleGroup } from '../../data/exercises';
import { workoutVolume, workoutSetCount } from '../../utils/workoutStats';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function WorkoutRow({ workout }) {
  const groups = [...new Set(workout.exercises.map((e) => e.muscleGroup))]
    .map(getMuscleGroup)
    .filter(Boolean);

  return (
    <Link to={`/workouts/${workout.id}`} className="card flex items-center gap-3 p-4">
      <span className="w-14 shrink-0 text-sm font-medium text-neutral-400">
        {formatDate(workout.finishedAt)}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-neutral-200 truncate">
          {groups.map((g) => g.label).join(', ') || 'Workout'}
        </p>
        <p className="text-xs text-neutral-500">
          {workout.exercises.length} exercises · {workoutSetCount(workout)} sets
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-neutral-100 tabular-nums">
          {workoutVolume(workout).toLocaleString('en-US')}
        </p>
        <p className="text-xs text-neutral-500">kg</p>
      </div>
    </Link>
  );
}

export default function RecentWorkoutsList({ workouts }) {
  const finished = workouts.filter((w) => w.finishedAt);
  const recent = finished.slice(0, 3);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-neutral-100">Recent</h2>
        {finished.length > 0 && (
          <Link to="/history" className="text-sm font-medium text-[var(--ember)]">
            See all
          </Link>
        )}
      </div>
      {recent.length === 0 ? (
        <div className="card p-6 text-center text-sm text-neutral-500">No sessions logged yet.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {recent.map((w) => (
            <WorkoutRow key={w.id} workout={w} />
          ))}
        </div>
      )}
    </section>
  );
}
