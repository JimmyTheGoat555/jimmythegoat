import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getMuscleGroup } from '../../data/exercises';
import { workoutVolume, workoutSetCount } from '../../utils/workoutStats';
import ConfirmDialog from '../shared/ConfirmDialog';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function HistoryList({ workouts, deleteWorkout }) {
  const navigate = useNavigate();
  const finished = workouts.filter((w) => w.finishedAt);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const handleDelete = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  return (
    <div className="flex flex-col gap-4 pt-6 pb-nav">
      <div>
        <button type="button" onClick={() => navigate(-1)} className="text-sm text-neutral-500 mb-1">
          ← Back
        </button>
        <h1 className="text-3xl font-bold text-neutral-50">History</h1>
      </div>

      {finished.length === 0 ? (
        <div className="card p-8 text-center text-sm text-neutral-500">No workouts saved yet.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {finished.map((workout) => {
            const groups = [...new Set(workout.exercises.map((e) => e.muscleGroup))]
              .map(getMuscleGroup)
              .filter(Boolean);

            return (
              <li key={workout.id}>
                <Link to={`/workouts/${workout.id}`} className="card flex items-center gap-3 p-4">
                  <span className="w-16 shrink-0 text-sm font-medium text-neutral-400">
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
                  <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                    <p className="text-sm font-semibold text-neutral-100 tabular-nums">
                      {workoutVolume(workout).toLocaleString('en-US')} kg
                    </p>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, workout.id)}
                      className="text-xs font-medium text-neutral-600"
                    >
                      Delete
                    </button>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pendingDeleteId && (
        <ConfirmDialog
          title="Delete this workout?"
          message="This can't be undone."
          confirmLabel="Delete"
          onConfirm={() => {
            deleteWorkout(pendingDeleteId);
            setPendingDeleteId(null);
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
