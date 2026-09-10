export default function StatTile({ label, value, unit, delta }) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta);
  const deltaPositive = hasDelta && delta >= 0;

  return (
    <div className="card px-4 py-4 flex flex-col gap-1">
      <span className="text-sm text-neutral-500">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-neutral-50 tabular-nums">{value}</span>
        {unit && <span className="text-sm text-neutral-500">{unit}</span>}
      </div>
      {hasDelta && (
        <span
          className={`text-xs font-medium ${deltaPositive ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
        >
          {deltaPositive ? '▲' : '▼'} {Math.abs(delta)}% vs last week
        </span>
      )}
    </div>
  );
}
