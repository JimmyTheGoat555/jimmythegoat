import { useEffect } from 'react';
import WheelPicker from '../shared/WheelPicker';
import { REPS_MAX, REPS_MIN, formatWorkingWeight } from '../../utils/units';

// ── The wheel, back, without the calculator it used to be wrapped in ────
//
// This sheet existed before, was removed with the plate calculator, and is
// back because removing it was the wrong half of the change. The thing
// that had to go was the ARITHMETIC — "plates per side on a bar you pick
// from a rack of six", which asked the lifter to hold a mental model
// before they could log a set. The wheel itself was never the problem: it
// is the fastest way there is to land on a number with one thumb and no
// keyboard covering half the screen.
//
// So what is here now is the wheel and nothing else:
//
//   • one dial for the weight, in whatever unit the row is asking for
//     (per hand / total / belt) — the row decides, this only spins;
//   • one dial for the reps;
//   • a − / + pair under each, half a kilo and one rep;
//   • the live total, when the number on the dial is not the whole load.
//
// No bar picker, no plate row, no per-side mode. The dial steps in 0.5 kg
// for the same reason the buttons do: it is the smallest increment on a
// real rack, and every value a stepper can produce has to exist on the
// wheel or the two fight each other (the old version stepped 1.25 on a
// whole-kilo ladder and quietly did nothing on alternate presses).
//
// Presentational on purpose. Every number that goes in or out of here is
// in the units the ROW is already showing, and SetRow owns the translation
// to a stored set — the `weight`/`perHandWeight`/`isPerHand` contract in
// utils/setLoad.js is delicate enough to live in exactly one place.
// Changes are live, so "Done" only dismisses.

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round1 = (n) => Math.round(n * 10) / 10;

function Stepper({ onDown, onUp, children, downLabel, upLabel }) {
  return (
    <div className="mt-2 flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={onDown}
        aria-label={downLabel}
        className="h-10 w-10 rounded-full bg-neutral-800 text-xl font-bold leading-none text-neutral-200 transition active:scale-90"
      >
        −
      </button>
      <span className="w-14 text-center text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {children}
      </span>
      <button
        type="button"
        onClick={onUp}
        aria-label={upLabel}
        className="h-10 w-10 rounded-full bg-neutral-800 text-xl font-bold leading-none text-neutral-200 transition active:scale-90"
      >
        +
      </button>
    </div>
  );
}

export default function SetEntrySheet({
  index,
  // What the weight dial is asking for, in the row's own words: "Per
  // hand", "Weight", "Added". Comes from WeightEntryKind's ENTRY_COPY.
  label,
  // The current value in that unit, or null for a set with nothing on it
  // yet — which opens on `seedWeight` and writes it straight away, so
  // closing the sheet always leaves a set that can be ticked off.
  weight,
  seedWeight,
  min,
  max,
  step,
  reps,
  seedReps,
  // The whole load this set represents — shown only when it is saying
  // something the dial does not (a pair of dumbbells, body weight + belt).
  totalText,
  onWeight,
  onReps,
  // Fills a blank set with what the dials are already showing, so opening
  // the sheet and closing it leaves a set that can be ticked off. Separate
  // from onWeight/onReps because the row must NOT read this as the lifter
  // having entered something — a set nobody touched does not tick itself.
  onSeed,
  onClose,
}) {
  const w = weight ?? seedWeight;
  const r = reps ?? seedReps;

  useEffect(() => {
    onSeed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setWeight = (v) => onWeight(round1(clamp(Number(v), min, max)));
  const setReps = (v) => onReps(clamp(Math.round(Number(v)), REPS_MIN, REPS_MAX));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full rounded-t-3xl border border-white/10 bg-neutral-950 sm:max-w-sm sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Set ${index + 1}`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 pb-3 pt-5">
          <h2 className="text-lg font-bold text-neutral-50">Set {index + 1}</h2>
          <button
            type="button"
            onClick={onClose}
            className="px-1 text-2xl leading-none text-neutral-500"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 px-5 py-5">
          <div className="flex flex-col items-center">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{label} · kg</p>
            <WheelPicker
              className="w-full"
              value={w}
              min={min}
              max={max}
              step={step}
              formatValue={formatWorkingWeight}
              onChange={setWeight}
              ariaLabel={`${label} in kilograms`}
            />
            <Stepper
              onDown={() => setWeight(w - step)}
              onUp={() => setWeight(w + step)}
              downLabel={`Decrease weight by ${step} kilograms`}
              upLabel={`Increase weight by ${step} kilograms`}
            >
              {step} kg
            </Stepper>
          </div>

          <div className="flex flex-col items-center">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Reps</p>
            <WheelPicker
              className="w-full"
              value={r}
              min={REPS_MIN}
              max={REPS_MAX}
              step={1}
              onChange={setReps}
              ariaLabel="Reps"
            />
            <Stepper
              onDown={() => setReps(r - 1)}
              onUp={() => setReps(r + 1)}
              downLabel="One rep fewer"
              upLabel="One rep more"
            >
              1 rep
            </Stepper>
          </div>
        </div>

        {totalText && (
          <div className="px-5 pb-4">
            <div className="flex items-baseline justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Total lifted</span>
              <span className="text-xl font-extrabold tabular-nums" style={{ color: 'var(--tier-accent)' }}>
                {totalText}
              </span>
            </div>
          </div>
        )}

        <div className="px-5 pb-5" style={{ paddingBottom: 'calc(1.25rem + var(--safe-b))' }}>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-[var(--success)] py-3.5 text-base font-semibold text-white transition active:scale-[0.98]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
