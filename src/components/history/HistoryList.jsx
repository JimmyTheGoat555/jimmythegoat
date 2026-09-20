import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReturnTo } from '../../hooks/useReturnTo';
import { getMuscleGroup } from '../../data/exercises';
import { workoutVolume, workoutSetCount } from '../../utils/workoutStats';
import ConfirmDialog from '../shared/ConfirmDialog';
import { QuickShareSheet, ShareWorkoutButton } from '../workout/QuickShare';

// The end-of-workout celebration, replayed for a past session. Lazy: it
// pulls the animated card and the mascot art, and most visits to History
// never open it.
const WorkoutCelebration = lazy(() => import('../workout/WorkoutCelebration'));

// Rows shown at first, and added per "Show older" tap. The list used to
// render the whole history at once — every card, every volume sum — and
// a long history made opening this tab the slowest thing in the app.
const PAGE_SIZE = 30;

// The year only when it is not this one: the row gained a share button
// on its right, and a date that wraps to two lines is what it cost.
function formatDate(iso) {
  const date = new Date(iso);
  const thisYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', ...(thisYear ? {} : { year: 'numeric' }) });
}

export default function HistoryList({ workouts, deleteWorkout }) {
  const goBack = useReturnTo('/progress');
  const finished = workouts.filter((w) => w.finishedAt);
  const [shown, setShown] = useState(PAGE_SIZE);
  const visible = finished.slice(0, shown);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  // Which past workout's summary is playing, or null. Read-only: the
  // celebration in replay mode is fed the stored document and writes
  // nothing — see WorkoutCelebration's header.
  const [replayId, setReplayId] = useState(null);
  const replaying = replayId ? finished.find((w) => w.id === replayId) : null;
  // Which past workout is being shared straight from its row — the same
  // screen as the replay, opened on its stickers (QuickShare.jsx).
  const [sharingId, setSharingId] = useState(null);
  const sharing = sharingId ? finished.find((w) => w.id === sharingId) : null;

  const handleDelete = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  const handleReplay = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    setReplayId(id);
  };

  return (
    <div className="flex flex-col gap-4 pt-6 pb-nav">
      <div>
        <button type="button" onClick={goBack} className="text-sm text-neutral-500 mb-1">
          ← Back
        </button>
        <h1 className="text-3xl font-bold text-neutral-50">History</h1>
      </div>

      {finished.length === 0 ? (
        <div className="card p-8 text-center text-sm text-neutral-500">No workouts saved yet.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((workout) => {
            const groups = [...new Set(workout.exercises.map((e) => e.muscleGroup))]
              .map(getMuscleGroup)
              .filter(Boolean);

            return (
              <li key={workout.id}>
                <Link
                  to={`/workouts/${workout.id}`}
                  state={{ from: '/history' }}
                  className="card flex items-center gap-3 p-4"
                >
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
                  <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                    <p className="text-sm font-semibold text-neutral-100 tabular-nums">
                      {workoutVolume(workout).toLocaleString('en-US')} kg
                    </p>
                    <div className="flex items-center gap-3">
                      {/* Replays the finish-line summary for this session
                          and offers to share it. Inside the row's Link, so
                          it stops the navigation the way Delete does. */}
                      <button
                        type="button"
                        onClick={(e) => handleReplay(e, workout.id)}
                        className="text-xs font-semibold text-[var(--tier-accent)]"
                        aria-label="Replay summary"
                      >
                        ▶ Replay
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, workout.id)}
                        className="text-xs font-medium text-neutral-600"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <ShareWorkoutButton onClick={() => setSharingId(workout.id)} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {finished.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE_SIZE)}
          className="card p-3 text-center text-sm font-semibold text-neutral-300"
        >
          Show older workouts ({finished.length - shown} more)
        </button>
      )}

      {replaying && (
        <Suspense fallback={null}>
          <WorkoutCelebration replay workout={replaying} onDone={() => setReplayId(null)} />
        </Suspense>
      )}
      <QuickShareSheet workout={sharing} onClose={() => setSharingId(null)} />

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
