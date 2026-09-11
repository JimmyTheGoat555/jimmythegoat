import { useMemo } from 'react';
import WheelPicker from './WheelPicker';
import { roundToTenth } from '../../utils/units';

// Body weight as an iOS-style SPLIT dial: left wheel picks the whole
// kilos, right wheel the tenth (.0–.9). Two short wheels instead of one
// 1,650-row 0.1-step wheel — you spin straight to 82, then nudge the
// tenth, the way a real scale reads.
//
// Built on the same WheelPicker primitive ScrollWheelPicker uses (it owns
// the scroll-snap physics, vertical-only touch handling, and the per-notch
// haptic tick); this just wires two of them to one kg value and adds the
// readout and fade masks.
//
//   <BodyWeightWheel value={kg} onChange={setKg} min={35} max={200} />
export default function BodyWeightWheel({ value, onChange, min = 35, max = 200, label = 'Body weight' }) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : min;
  const whole = Math.floor(roundToTenth(safe) + 1e-9);
  const tenth = Math.round((roundToTenth(safe) - whole) * 10);

  const emit = (nextWhole, nextTenth) => {
    onChange(roundToTenth(nextWhole + nextTenth / 10));
  };

  const tenthFormat = useMemo(() => (n) => `.${n}`, []);

  return (
    <div className="w-full">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-white/50 mb-2">{label}</p>

      <div className="flex items-end justify-center gap-2 mb-1">
        <span className="text-5xl font-extrabold tabular-nums text-white drop-shadow-[0_2px_16px_rgba(124,58,237,0.6)]">
          {whole}.{tenth}
        </span>
        <span className="text-lg font-bold text-white/60 pb-1.5">kg</span>
      </div>

      <div className="relative mx-auto flex max-w-[240px] items-stretch rounded-2xl bg-black/40 border border-white/10 overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 z-10 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 z-10 bg-gradient-to-t from-black/70 to-transparent" />
        <WheelPicker
          className="flex-1"
          value={whole}
          onChange={(w) => emit(w, tenth)}
          min={min}
          max={max}
          step={1}
          ariaLabel={`${label} — whole kilograms`}
        />
        <WheelPicker
          className="w-16 border-l border-white/10"
          value={tenth}
          onChange={(t) => emit(whole, t)}
          min={0}
          max={9}
          step={1}
          formatValue={tenthFormat}
          ariaLabel={`${label} — tenths of a kilogram`}
        />
      </div>
    </div>
  );
}
