import { lifetimeVolume } from '../../utils/workoutStats';
import { formatIdleNumber, getLifetimeProgress } from '../../utils/formatIdleNumber';

export default function LifetimeVolumeCard({ workouts }) {
  const total = lifetimeVolume(workouts);
  const { currentLabel, nextLabel, percent } = getLifetimeProgress(total);

  return (
    <div className="card p-5">
      <p className="text-sm text-neutral-500">Lifetime tonnage</p>
      <p className="text-4xl font-bold text-neutral-50 mt-1 tabular-nums">
        {formatIdleNumber(total)} <span className="text-lg font-medium text-neutral-500">kg</span>
      </p>
      <div className="mt-4">
        <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--ember)] transition-all duration-700"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs text-neutral-500">
          <span>{currentLabel ?? 'Start'}</span>
          <span>{nextLabel}</span>
        </div>
      </div>
    </div>
  );
}
