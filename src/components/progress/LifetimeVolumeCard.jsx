import { lifetimeVolume } from '../../utils/workoutStats';
import { getEvolutionProgress, pointsToDisplayKg, formatTierGoalKg } from '../../utils/evolutionTiers';

// The cumulative progression metric. Under the hood it's Relative Strength
// Volume points (body-weight-fair — see utils/workoutStats.js), and that's
// what drives the tier + the bar's fill. The NUMBERS shown here are those
// points scaled by the user's body weight into a big absolute-kg goal
// (75 kg fallback in formatTierGoalKg) — same milestone, framed for the
// dopamine hit. `bodyWeightKg` comes from App via ProgressView.
export default function LifetimeVolumeCard({ workouts, bodyWeightKg = 0 }) {
  const score = lifetimeVolume(workouts);
  const { current, next, percent, isMaxTier } = getEvolutionProgress(score);

  return (
    <div className="card p-5">
      <p className="text-sm text-neutral-500">Lifetime Volume</p>
      <p className="text-4xl font-bold text-neutral-50 mt-1 tabular-nums">
        {pointsToDisplayKg(score, bodyWeightKg).toLocaleString('en-US')}{' '}
        <span className="text-lg font-medium text-neutral-500">kg</span>
      </p>
      <div className="mt-4">
        <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--ember)] transition-all duration-700"
            style={{ width: `${isMaxTier ? 100 : percent}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs text-neutral-500 tabular-nums">
          <span>{formatTierGoalKg(score, bodyWeightKg)}</span>
          <span>{isMaxTier ? 'Maxed' : formatTierGoalKg(next.threshold, bodyWeightKg)}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between text-xs text-neutral-600">
          <span>{current.label}</span>
          <span>{isMaxTier ? '' : next.label}</span>
        </div>
      </div>
    </div>
  );
}
