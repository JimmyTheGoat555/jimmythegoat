import {
  OPTIMAL_WEEKLY_SETS_MAX,
  OPTIMAL_WEEKLY_SETS_MIN,
  weeklySetsByMuscleGroup,
} from '../../utils/workoutStats';

const CEILING = 24;

function statusColor(sets) {
  if (sets < OPTIMAL_WEEKLY_SETS_MIN) return 'var(--ember)';
  if (sets <= OPTIMAL_WEEKLY_SETS_MAX) return 'var(--success)';
  return '#5ac8fa'; // informational, not a warning — "high volume" isn't bad
}

function GroupRow({ group }) {
  const fillPercent = Math.min(100, (group.sets / CEILING) * 100);

  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
      <span className="flex-1 text-base text-neutral-200">{group.label}</span>
      <div className="w-24 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${fillPercent}%`, backgroundColor: statusColor(group.sets) }}
        />
      </div>
      <span className="w-7 text-right text-sm font-medium text-neutral-400 tabular-nums">{group.sets}</span>
    </div>
  );
}

export default function MuscleGroupGoals({ workouts }) {
  const groups = weeklySetsByMuscleGroup(workouts);

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-neutral-100">Muscle Groups</h2>
        <span className="text-xs text-neutral-500">
          {OPTIMAL_WEEKLY_SETS_MIN}-{OPTIMAL_WEEKLY_SETS_MAX} sets/wk
        </span>
      </div>
      <div className="divide-y divide-neutral-800/60">
        {groups.map((group) => (
          <GroupRow key={group.id} group={group} />
        ))}
      </div>
    </section>
  );
}
