import { useEffect, useMemo, useRef } from 'react';
import WheelPicker from './WheelPicker';

// A presentation layer over the battle-tested WheelPicker (that component
// owns the scroll-snap physics, keyboard control, and the "read back the
// snapped value once momentum stops" logic — see there). ScrollWheelPicker
// adds what the gamer-grade onboarding needs on top:
//
//   • a big current-value readout with a unit suffix
//   • integer OR 0.1-precision float ranges via `precision`
//   • a light haptic tick (navigator.vibrate) on every value change
//   • top/bottom fade masks so the column reads as a physical dial
//
//   <ScrollWheelPicker label="Body weight" value={w} onChange={setW}
//     min={35} max={200} precision={1} unit="kg" />
//   <ScrollWheelPicker label="Days per week" value={d} onChange={setD}
//     min={1} max={7} unit="days" />
export default function ScrollWheelPicker({
  value,
  onChange,
  min,
  max,
  // 0 → whole numbers (age, height, days). 1 → 0.1 steps (body weight).
  precision = 0,
  // Explicit step wins over the one derived from `precision`.
  step,
  unit = '',
  label,
  ariaLabel,
  className = '',
}) {
  const resolvedStep = step ?? (precision >= 1 ? 0.1 : 1);

  // Haptics: skip the first render and any programmatic echo where the
  // value didn't actually move, so the phone only buzzes on a real turn
  // of the dial.
  const lastHapticValue = useRef(value);
  useEffect(() => {
    if (value !== lastHapticValue.current) {
      lastHapticValue.current = value;
      navigator.vibrate?.(8);
    }
  }, [value]);

  const formatValue = useMemo(
    () => (n) => {
      const num = Number(n);
      if (!Number.isFinite(num)) return '—';
      return precision >= 1 ? num.toFixed(1) : String(num);
    },
    [precision],
  );

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-white/50 mb-2">
          {label}
        </p>
      )}

      <div className="flex items-end justify-center gap-2 mb-1">
        <span className="text-5xl font-extrabold tabular-nums text-white drop-shadow-[0_2px_16px_rgba(124,58,237,0.6)]">
          {formatValue(value)}
        </span>
        {unit && <span className="text-lg font-bold text-white/60 pb-1.5">{unit}</span>}
      </div>

      <div className="relative mx-auto max-w-[240px] rounded-2xl bg-black/40 border border-white/10 overflow-hidden">
        {/* Fade masks — the dial "rolls off" into the dark at top and bottom. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 z-10 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 z-10 bg-gradient-to-t from-black/70 to-transparent" />
        <WheelPicker
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          step={resolvedStep}
          formatValue={formatValue}
          ariaLabel={ariaLabel ?? label}
        />
      </div>
    </div>
  );
}
