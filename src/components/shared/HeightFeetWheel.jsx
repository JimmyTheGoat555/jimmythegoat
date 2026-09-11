import { useEffect, useMemo, useRef } from 'react';
import WheelPicker from './WheelPicker';

// Height in imperial as an iOS-style SPLIT dial: left wheel picks feet,
// right wheel inches (0–11) — the way a height is actually said out loud
// ("five nine"), instead of one long 48–95 inch wheel.
//
// `value` / `onChange` are in TOTAL INCHES, so the parent can keep holding
// height as one number and convert to cm the same way (× 2.54) whichever
// unit the wheels are in.
//
// Each wheel merges its change onto `partsRef` (the last-emitted feet +
// inches) rather than onto render-closure values, so a feet-settle and an
// inches-settle in the same tick compose instead of clobbering — same fix
// as DateWheel.
//
//   <HeightFeetWheel value={totalInches} onChange={setTotalInches} />

const FEET_MIN = 4;
const FEET_MAX = 7;
const IN_MIN = 0;
const IN_MAX = 11;

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

export default function HeightFeetWheel({ value, onChange, label = 'Height' }) {
  const total = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 69;
  const ft = clamp(Math.floor(total / 12), FEET_MIN, FEET_MAX);
  const inches = clamp(total - ft * 12, IN_MIN, IN_MAX);

  const partsRef = useRef({ ft, in: inches });
  useEffect(() => {
    partsRef.current = { ft, in: inches };
  }, [ft, inches]);

  const setPart = (patch) => {
    const next = { ...partsRef.current, ...patch };
    next.ft = clamp(next.ft, FEET_MIN, FEET_MAX);
    next.in = clamp(next.in, IN_MIN, IN_MAX);
    partsRef.current = next;
    onChange(next.ft * 12 + next.in);
  };

  const ftFormat = useMemo(() => (n) => `${n} ft`, []);
  const inFormat = useMemo(() => (n) => `${n} in`, []);

  return (
    <div className="w-full">
      <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-white/50">{label}</p>

      <div className="mb-1 flex items-end justify-center">
        <span className="text-5xl font-extrabold tabular-nums text-white drop-shadow-[0_2px_16px_rgba(124,58,237,0.6)]">
          {ft}′ {inches}″
        </span>
      </div>

      <div className="relative mx-auto flex max-w-[240px] items-stretch overflow-hidden rounded-2xl border border-white/10 bg-black/40">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-black/70 to-transparent" />
        <WheelPicker
          className="flex-1"
          value={ft}
          onChange={(f) => setPart({ ft: f })}
          min={FEET_MIN}
          max={FEET_MAX}
          step={1}
          formatValue={ftFormat}
          ariaLabel={`${label} — feet`}
        />
        <WheelPicker
          className="flex-1 border-l border-white/10"
          value={inches}
          onChange={(i) => setPart({ in: i })}
          min={IN_MIN}
          max={IN_MAX}
          step={1}
          formatValue={inFormat}
          ariaLabel={`${label} — inches`}
        />
      </div>
    </div>
  );
}
