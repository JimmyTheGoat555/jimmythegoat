// The Founder Console's building blocks: one card, one big number, one
// reference row, one bar, one "this is a mock" chip. Every panel in
// components/admin draws from these and nothing else, which is what keeps
// three tabs reading as one control room instead of three dashboards.
//
// Numbers are never invented here. `Metric` shows a dash while loading,
// "Unavailable" with the reason when its query failed (adminAnalytics.js
// reports per-metric errors for exactly this), and a MOCK chip when the
// panel handed it a placeholder because the database does not record the
// thing yet — so a founder reading the screen always knows which of the
// three they are looking at.

export const CARD =
  'rounded-2xl border border-white/[0.07] bg-white/[0.035] shadow-[0_14px_36px_-22px_rgba(0,0,0,0.95)] backdrop-blur-[2px]';

export function fmt(value, digits = 0) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function MockChip({ label = 'mock' }) {
  return (
    <span
      title="Placeholder — the database does not record this yet. Wire it up in adminAnalytics.js."
      className="rounded-md border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300"
    >
      {label}
    </span>
  );
}

export function Panel({ eyebrow, title, aside, children, className = '' }) {
  return (
    <section className={`${CARD} flex flex-col gap-3 p-4 sm:p-5 ${className}`}>
      {(eyebrow || title || aside) && (
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{eyebrow}</p>
            )}
            {title && <h3 className="mt-0.5 text-base font-bold leading-tight text-neutral-50">{title}</h3>}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

// A big number and what it means. `error` wins over `value`, both win
// over the loading dash. `mock` flags a placeholder.
export function Metric({ label, value, unit, digits = 0, hint, error, loading, mock = false, tone = 'accent' }) {
  const color = tone === 'accent' ? 'var(--tier-accent)' : tone === 'good' ? 'var(--success)' : '#f5f5f5';
  return (
    <div className={`${CARD} flex min-h-[104px] flex-col justify-between p-4`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{label}</p>
        {mock && <MockChip />}
      </div>
      {error ? (
        <p className="mt-1 text-xs leading-snug text-[var(--danger)]" title={error}>
          Unavailable
        </p>
      ) : (
        <p className="mt-1 flex items-baseline gap-1 leading-none">
          <span className="text-3xl font-extrabold tabular-nums" style={{ color }}>
            {loading ? '—' : typeof value === 'string' ? value : fmt(value, digits)}
          </span>
          {unit && !loading && value != null && <span className="text-xs font-semibold text-neutral-500">{unit}</span>}
        </p>
      )}
      {hint && !error && <p className="mt-1.5 text-[10px] leading-snug text-neutral-500">{hint}</p>}
    </div>
  );
}

// A label/value pair for the reference layer under the headline numbers.
export function Stat({ label, value, hint, digits = 0 }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 px-1 py-2 last:border-0">
      <span className="text-xs text-neutral-400">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-neutral-100">
        {typeof value === 'string' ? value : fmt(value, digits)}
        {hint && <span className="ml-1.5 text-[10px] font-normal text-neutral-500">{hint}</span>}
      </span>
    </div>
  );
}

// One horizontal bar, scaled to `max`, for the small charts.
export function BarRow({ label, value, max, display, color = 'var(--tier-accent)', sub }) {
  const width = max > 0 && value != null ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-xs text-neutral-300">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${width}%`, background: color }}
        />
      </div>
      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-neutral-200">
        {display ?? fmt(value)}
        {sub && <span className="text-neutral-600"> · {sub}</span>}
      </span>
    </div>
  );
}

export function Empty({ children }) {
  return <p className="py-2 text-center text-xs text-neutral-500">{children}</p>;
}

export function Button({ children, tone = 'primary', className = '', ...props }) {
  const styles =
    tone === 'primary'
      ? { background: 'var(--tier-accent)', color: 'var(--color-jimmy-950)' }
      : tone === 'danger'
        ? { background: 'color-mix(in srgb, var(--danger) 85%, black)', color: 'white' }
        : { background: 'rgba(255,255,255,0.08)', color: '#e5e5e5' };
  return (
    <button
      type="button"
      className={`rounded-xl px-4 py-2.5 text-sm font-bold transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${className}`}
      style={styles}
      {...props}
    >
      {children}
    </button>
  );
}

export const INPUT =
  'w-full rounded-xl border border-white/10 bg-neutral-950/70 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-[var(--tier-accent)] focus:outline-none';
export const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500';
