import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTrainerTrainees } from '../../hooks/useTrainerTrainees';
import { useReadOnlyWorkouts } from '../../hooks/useCloudWorkouts';
import { useReadOnlyProfile } from '../../hooks/useCloudProfile';
import { workoutVolume, workoutSetCount } from '../../utils/workoutStats';
import { bodyTypeLabel, fitnessGoalLabel } from '../../utils/onboarding';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TraineeDetail({ profile, onRemoveTrainee }) {
  const { traineeId } = useParams();
  const navigate = useNavigate();
  const { roster } = useTrainerTrainees(profile.id);
  const { workouts, loading } = useReadOnlyWorkouts(traineeId);
  const { profile: traineeProfile } = useReadOnlyProfile(traineeId);

  const trainee = roster.find((t) => t.id === traineeId);
  const latestWeight = traineeProfile.bodyWeightLog[0]?.weight;

  // The coach's half of the disconnect — the trainee has the same control on
  // their own Profile. Either side can end it; see functions/coaching.js.
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState(null);

  const handleRemove = async () => {
    setRemoveError(null);
    setRemoveBusy(true);
    try {
      await onRemoveTrainee(traineeId);
      navigate('/trainees');
    } catch (err) {
      setRemoveError(err.message ?? 'Could not remove — try again.');
      setRemoveBusy(false);
    }
  };

  if (!trainee) {
    return (
      <div className="pt-6 pb-24 flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-neutral-500">
          {loading ? 'Loading…' : "This trainee isn't connected to you (anymore)."}
        </p>
        <button type="button" onClick={() => navigate('/trainees')} className="text-sm font-medium text-[var(--ember)]">
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pt-6 pb-24">
      <button type="button" onClick={() => navigate('/trainees')} className="text-sm text-neutral-500 -mb-1">
        ← Back
      </button>

      <header className="flex items-center gap-3">
        <span className="text-5xl leading-none">{trainee.evolution.current.emoji}</span>
        <div>
          <h1 className="text-2xl font-bold text-neutral-50">{trainee.displayName}</h1>
          <p className="text-sm text-neutral-500">{trainee.evolution.current.label}</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-neutral-50 tabular-nums">
            {trainee.totalVolume.toLocaleString('en-US')}
          </p>
          <p className="text-sm text-neutral-500">kg lifetime tonnage</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-neutral-50 tabular-nums">
            {latestWeight ?? '—'}
          </p>
          <p className="text-sm text-neutral-500">kg body weight</p>
        </div>
      </div>

      {(traineeProfile.bodyType || traineeProfile.fitnessGoal || traineeProfile.weeklyTarget) && (
        <div className="card p-4 flex flex-col gap-2.5">
          <p className="text-sm text-neutral-500">Training Profile</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-sm font-semibold text-neutral-100">{bodyTypeLabel(traineeProfile.bodyType) ?? '—'}</p>
              <p className="text-xs text-neutral-500 mt-0.5">Body Type</p>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--tier-accent)' }}>
                {fitnessGoalLabel(traineeProfile.fitnessGoal) ?? '—'}
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">Goal</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-100">
                {traineeProfile.weeklyTarget ? `${traineeProfile.weeklyTarget}x/wk` : '—'}
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">Target</p>
            </div>
          </div>
        </div>
      )}

      {traineeProfile.bodyWeightLog.length > 0 && (
        <div className="card p-4 flex flex-col gap-1.5">
          <p className="text-sm text-neutral-500 mb-1">Body weight log</p>
          {traineeProfile.bodyWeightLog.slice(0, 5).map((entry) => (
            <div key={entry.id} className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">{formatDate(entry.date)}</span>
              <span className="text-neutral-100 font-semibold tabular-nums">{entry.weight} kg</span>
            </div>
          ))}
        </div>
      )}

      <Link
        to={`/trainees/${traineeId}/assign`}
        className="w-full text-center bg-[var(--ember)] text-white text-base font-semibold py-4 rounded-2xl active:scale-[0.98] transition"
      >
        + Assign a Workout
      </Link>

      <h2 className="text-lg font-bold text-neutral-50 mt-2">Workout History</h2>

      {loading ? (
        <p className="text-sm text-neutral-500 text-center py-8">Loading…</p>
      ) : workouts.length === 0 ? (
        <div className="card p-8 text-center text-sm text-neutral-500">No workouts logged yet.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {workouts.map((workout) => (
            <li key={workout.id}>
              <Link
                to={`/trainees/${traineeId}/workouts/${workout.id}`}
                className="card flex items-center gap-3 p-4"
              >
                <span className="w-16 shrink-0 text-sm font-medium text-neutral-400">
                  {formatDate(workout.finishedAt)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-200 truncate">
                    {workout.exercises.length} exercises · {workoutSetCount(workout)} sets
                  </p>
                </div>
                <p className="text-sm font-semibold text-neutral-100 tabular-nums shrink-0">
                  {workoutVolume(workout).toLocaleString('en-US')} kg
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-6 pt-4 border-t border-white/10 flex flex-col items-start gap-2">
        {confirmingRemove ? (
          <>
            <p className="text-xs text-neutral-400">
              You'll stop seeing {trainee.displayName}'s workouts and weigh-ins, and the workouts
              you assigned them will be removed. Their own history stays theirs.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleRemove}
                disabled={removeBusy}
                className="text-xs font-semibold text-[var(--danger)] disabled:opacity-50"
              >
                {removeBusy ? 'Removing…' : 'Yes, remove trainee'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRemove(false)}
                disabled={removeBusy}
                className="text-xs text-neutral-500"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => { setRemoveError(null); setConfirmingRemove(true); }}
            className="text-xs text-neutral-500 underline underline-offset-2"
          >
            Remove this trainee
          </button>
        )}
        {removeError && <p className="text-xs text-[var(--danger)]">{removeError}</p>}
      </section>
    </div>
  );
}
