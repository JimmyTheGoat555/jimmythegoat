import StatTile from './StatTile';
import { weeklySummary } from '../../utils/workoutStats';

export default function WeeklySummaryCard({ workouts }) {
  const summary = weeklySummary(workouts);

  return (
    <section>
      <h2 className="text-lg font-semibold text-neutral-100 mb-3">This Week</h2>
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Workouts" value={summary.workoutCount} />
        <StatTile label="Sets" value={summary.totalSets} />
        <StatTile
          label="Volume"
          value={summary.totalVolume.toLocaleString('en-US')}
          unit="kg"
          delta={summary.volumeDeltaPct}
        />
      </div>
    </section>
  );
}
