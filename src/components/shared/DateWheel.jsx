import { useEffect, useMemo, useRef } from 'react';
import WheelPicker from './WheelPicker';
import { MIN_SIGNUP_AGE, MAX_SIGNUP_AGE } from '../../utils/onboarding';

// A birthday as three side-by-side dials (day · month · year), built on
// the same WheelPicker primitive as everywhere else. One combined readout
// on top; `onChange` emits a `YYYY-MM-DD` string. The day is clamped to
// the chosen month's length on every emit so "31 Feb" can't leave here.
//
// Each wheel merges its change onto `partsRef` — the last-emitted date —
// rather than onto values captured in its render closure. Without that, a
// year-wheel settle and a day-wheel settle firing in the same tick each
// overwrite the other's field with a stale value (seen live: the readout
// stuck a step behind the wheels).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function daysInMonth(year, month /* 1-12 */) {
  return new Date(year, month, 0).getDate();
}
function pad2(n) {
  return String(n).padStart(2, '0');
}
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

// Parse an ISO date, or fall back to "25 years ago" so the wheels open
// somewhere sane rather than on today.
function parse(value) {
  const now = new Date();
  if (typeof value === 'string') {
    const [y, m, d] = value.split('-').map(Number);
    if (y && m && d) return { y, m, d };
  }
  return { y: now.getFullYear() - 25, m: 1, d: 1 };
}

export default function DateWheel({ value, onChange, label = 'Birthday' }) {
  const now = new Date();
  const maxYear = now.getFullYear() - MIN_SIGNUP_AGE;
  const minYear = now.getFullYear() - MAX_SIGNUP_AGE;

  const parsed = parse(value);
  const year = clamp(parsed.y, minYear, maxYear);
  const month = clamp(parsed.m, 1, 12);
  const day = clamp(parsed.d, 1, daysInMonth(year, month));

  // Authoritative last-emitted parts. Kept in sync with `value` after every
  // commit; mutated synchronously inside setPart so back-to-back wheel
  // settles compose instead of clobbering.
  const partsRef = useRef({ y: year, m: month, d: day });
  useEffect(() => {
    partsRef.current = { y: year, m: month, d: day };
  }, [year, month, day]);

  const setPart = (patch) => {
    const next = { ...partsRef.current, ...patch };
    next.y = clamp(next.y, minYear, maxYear);
    next.m = clamp(next.m, 1, 12);
    next.d = clamp(next.d, 1, daysInMonth(next.y, next.m));
    partsRef.current = next;
    onChange(`${next.y}-${pad2(next.m)}-${pad2(next.d)}`);
  };

  // Seed a value on mount so downstream (the write) never sees undefined
  // just because the wheels weren't touched.
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current && typeof value !== 'string') {
      seeded.current = true;
      setPart({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const yearOptions = useMemo(() => {
    const out = [];
    for (let yr = maxYear; yr >= minYear; yr -= 1) out.push(yr);
    return out;
  }, [maxYear, minYear]);
  const monthOptions = useMemo(() => MONTHS.map((name, i) => ({ value: i + 1, label: name })), []);

  return (
    <div className="w-full">
      <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-white/50">{label}</p>

      <div className="mb-1 flex items-end justify-center">
        <span className="text-4xl font-extrabold tabular-nums text-white drop-shadow-[0_2px_16px_rgba(124,58,237,0.6)]">
          {day} {MONTHS[month - 1]} {year}
        </span>
      </div>

      <div className="relative mx-auto flex max-w-[280px] items-stretch overflow-hidden rounded-2xl border border-white/10 bg-black/40">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-black/70 to-transparent" />
        <WheelPicker
          className="w-16"
          value={day}
          onChange={(d) => setPart({ d })}
          min={1}
          max={daysInMonth(year, month)}
          step={1}
          ariaLabel="Day"
        />
        <WheelPicker
          className="flex-1 border-x border-white/10"
          value={month}
          onChange={(m) => setPart({ m })}
          options={monthOptions}
          ariaLabel="Month"
        />
        <WheelPicker
          className="w-20"
          value={year}
          onChange={(y) => setPart({ y })}
          options={yearOptions}
          ariaLabel="Year"
        />
      </div>
    </div>
  );
}
