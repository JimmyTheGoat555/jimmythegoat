import { weeklySummary } from '../../utils/workoutStats';
import { formatIdleNumber } from '../../utils/formatIdleNumber';
import { getVolumeTierProgress } from '../../utils/volumeTiers';

export default function WeeklyVolumeCard({ workouts }) {
  const { totalVolume } = weeklySummary(workouts);
  const { currentLabel, nextLabel, percent } = getVolumeTierProgress(totalVolume);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">This week's volume</p>
        <span className="text-xs font-medium text-neutral-400 bg-neutral-800 px-2.5 py-1 rounded-full">
          {currentLabel}
        </span>
      </div>
      <p className="text-4xl font-bold text-neutral-50 mt-1 tabular-nums">
        {formatIdleNumber(totalVolume)} <span className="text-lg font-medium text-neutral-500">kg</span>
      </p>
      <div className="mt-4">
        <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--ember)] transition-all duration-700"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-neutral-500 text-right">
          {percent.toFixed(0)}% to {nextLabel}
        </p>
      </div>
    </div>
  );
}
