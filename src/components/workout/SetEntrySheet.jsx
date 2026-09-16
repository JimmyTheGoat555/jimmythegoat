import { useEffect, useMemo, useState } from 'react';
import WheelPicker from '../shared/WheelPicker';
import { defaultWeightForExercise } from '../../data/exercises';
import { BAR_TYPES, DEFAULT_BAR_ID, PLATE_STEPS_KG, barIdForWeight, getBarType } from '../../data/barbells';
import {
  isBarbellExercise,
  isDumbbellExercise,
  perHandFromSet,
  perSideFromSet,
  totalBarbellWeight,
  totalDumbbellWeight,
} from '../../utils/setLoad';
import {
  DEFAULT_REPS,
  formatWorkingWeight,
  nearestWorkingWeight,
  REPS_MAX,
  REPS_MIN,
  WORKING_WEIGHTS_KG,
} from '../../utils/units';

const clampR = (n) => Math.min(REPS_MAX, Math.max(REPS_MIN, Math.round(n)));

// Added-weight (belt) options for bodyweight exercises: 0, then the same
// 1 kg + half-kg steps up to a sane 120 kg.
const ADDED_WEIGHTS = [0, ...WORKING_WEIGHTS_KG.filter((v) => v <= 120)];
const nearestAdded = (n) => {
  const num = Number(n) || 0;
  return ADDED_WEIGHTS.reduce((best, v) => (Math.abs(v - num) < Math.abs(best - num) ? v : best));
};

// Per-side options, in 1.25 kg steps — the smallest plate in a metric gym,
// and therefore the real resolution of one side of a bar. NOT the shared
// WORKING_WEIGHTS_KG ladder, which steps in whole kilos: on that ladder
// the +1.25 button snapped to the nearest whole number and quietly did
// nothing on alternate presses. Starts at 0 because an empty bar is a real
// working set for a warm-up or a technique drill.
//
// Every entry is a multiple of 1.25, so doubling it always lands on a
// multiple of 2.5 — i.e. the TOTAL is always exactly representable at the
// 0.1 kg precision the rest of the app stores weights in.
const PER_SIDE_MAX = 200;
const PER_SIDE_STEP = 1.25;
const PER_SIDE_WEIGHTS = Array.from(
  { length: Math.round(PER_SIDE_MAX / PER_SIDE_STEP) + 1 },
  (_, i) => Math.round(i * PER_SIDE_STEP * 100) / 100,
);

// formatWorkingWeight rounds to one decimal, which turns 21.25 into
// "21.3" — fine for a wheel of whole kilos, wrong for plate arithmetic
// where the quarter matters and the number is meant to be checkable
// against what is on the bar.
const formatPlate = (n) => String(Math.round(Number(n) * 100) / 100);
const nearestPerSide = (n) => {
  const num = Number(n) || 0;
  return PER_SIDE_WEIGHTS.reduce((best, v) => (Math.abs(v - num) < Math.abs(best - num) ? v : best));
};

// The plate row. Each button ADDS that plate to one side — which is how
// people actually load a bar and talk about it ("put another twenty on")
// — and the total underneath moves by twice the number on the button.
// That is worth showing rather than explaining, hence the live total.
function PlateButtons({ onAdd, onClear, disabled }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {PLATE_STEPS_KG.map((plate) => (
        <button
          key={plate}
          type="button"
          onClick={() => onAdd(plate)}
          disabled={disabled}
          className="min-w-[3.25rem] rounded-xl border border-white/10 bg-neutral-800 px-2.5 py-2 text-sm font-bold tabular-nums text-neutral-100 active:scale-95 transition disabled:opacity-40"
        >
          +{plate}
        </button>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="min-w-[3.25rem] rounded-xl border border-white/10 px-2.5 py-2 text-sm font-semibold text-neutral-400 active:scale-95 transition"
        aria-label="Clear the bar"
      >
        Clear
      </button>
    </div>
  );
}

function Stepper({ onDown, onUp, children }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-2">
      <button
        type="button"
        onClick={onDown}
        className="w-9 h-9 rounded-full bg-neutral-800 text-neutral-200 text-lg font-bold active:scale-95 transition"
        aria-label="Decrease"
      >
        −
      </button>
      <span className="text-xs uppercase tracking-wide text-neutral-500 w-16 text-center">{children}</span>
      <button
        type="button"
        onClick={onUp}
        className="w-9 h-9 rounded-full bg-neutral-800 text-neutral-200 text-lg font-bold active:scale-95 transition"
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

// Bottom-sheet set editor — two scroll wheels instead of a numeric
// keyboard. For a weighted exercise the left wheel is the working weight
// (1 kg + 7.5/12.5/…); for a bodyweight one it's ADDED weight (belt), and
// the load itself is the lifter's body weight, folded in server-side by
// logWorkout. Changes are live, so "Done" just dismisses.
export default function SetEntrySheet({
  index,
  // Catalog id of the exercise this set belongs to — picks the wheel's
  // opening weight for a first-ever set (see seedLoad below).
  exerciseId,
  isBodyweight = false,
  weight,
  addedWeight,
  reps,
  // The set being edited, in full. `weight`/`addedWeight`/`reps` above are
  // still passed separately (every existing call site does), but the
  // barbell and dumbbell modes need the context fields — barWeight,
  // weightPerSide, perHandWeight — to re-open showing the numbers that
  // were actually typed rather than a back-solved approximation.
  set,
  lastSet,
  onChange,
  onClose,
}) {
  // Equipment comes from the catalog by id, never from the payload: it
  // decides how a number is interpreted, so it has to be the same answer
  // on this screen, in the volume maths and on the server.
  const isBarbell = !isBodyweight && isBarbellExercise(exerciseId);
  const isDumbbell = !isBodyweight && isDumbbellExercise(exerciseId);
  const weightOptions = useMemo(
    () => WORKING_WEIGHTS_KG.map((v) => ({ value: v, label: formatWorkingWeight(v) })),
    [],
  );
  const perSideOptions = useMemo(
    () => PER_SIDE_WEIGHTS.map((v) => ({ value: v, label: formatPlate(v) })),
    [],
  );
  const addedOptions = useMemo(
    () => ADDED_WEIGHTS.map((v) => ({ value: v, label: v === 0 ? '0' : formatWorkingWeight(v) })),
    [],
  );

  const seedLoad = () => {
    if (isBodyweight) {
      const n = Number(addedWeight);
      if (Number.isFinite(n) && n >= 0 && (weight !== '' || n > 0)) return nearestAdded(n);
      const last = Number(lastSet?.addedWeight);
      return nearestAdded(Number.isFinite(last) && last >= 0 ? last : 0);
    }
    if (isBarbell) {
      const bar = getBarType(seedBarId()).weight;
      const own = perSideFromSet({ ...set, weight }, bar);
      if (Number(weight) > 0) return nearestPerSide(own);
      const fromLast = perSideFromSet(lastSet, bar);
      if (Number(lastSet?.weight) > 0) return nearestPerSide(fromLast);
      // Never logged: put the catalog's typical working weight on the bar
      // rather than opening at an empty one.
      return nearestPerSide((defaultWeightForExercise(exerciseId) - bar) / 2);
    }
    if (isDumbbell) {
      // The wheel holds ONE dumbbell, the number written on the rack.
      const own = perHandFromSet({ ...set, weight });
      if (own > 0) return nearestWorkingWeight(own);
      const fromLast = perHandFromSet(lastSet);
      return nearestWorkingWeight(fromLast > 0 ? fromLast : defaultWeightForExercise(exerciseId));
    }
    const n = Number(weight);
    if (Number.isFinite(n) && n > 0) return nearestWorkingWeight(n);
    const last = Number(lastSet?.weight);
    // Your own last set always wins — it's the most accurate guess there
    // is. The per-exercise default only fills the gap for an exercise you
    // have never logged before.
    return nearestWorkingWeight(
      Number.isFinite(last) && last > 0 ? last : defaultWeightForExercise(exerciseId),
    );
  };
  // Which bar this set was logged with, in order of trust: the set's own
  // stored bar, then the last set of this exercise (you don't switch bars
  // mid-exercise), then Olympic.
  function seedBarId() {
    const own = barIdForWeight(set?.barWeight);
    if (own) return own;
    const last = barIdForWeight(lastSet?.barWeight);
    if (last) return last;
    return DEFAULT_BAR_ID;
  }

  const seedR = () => {
    const n = Number(reps);
    if (Number.isInteger(n) && n > 0) return clampR(n);
    const last = Number(lastSet?.reps);
    return clampR(Number.isFinite(last) && last > 0 ? last : DEFAULT_REPS);
  };

  // Whether this set already carries the calculator's own fields. Drives
  // the one-time backfill in the effect below.
  const hasContext = isBarbell
    ? Number.isFinite(Number(set?.weightPerSide))
    : isDumbbell
      ? set?.isPerHand === true
      : true;
  const [barId, setBarId] = useState(seedBarId);
  // working weight, OR added weight (bodyweight), OR per-side (barbell),
  // OR per-hand (dumbbell) — the wheel's meaning follows the equipment.
  const [load, setLoad] = useState(seedLoad);
  const [r, setR] = useState(seedR);

  const barWeight = getBarType(barId).weight;
  // The absolute load, which is the ONLY thing the rest of the app reads.
  // Everything else on the patch is context the sheet writes down so it
  // can reconstruct these exact inputs when the set is re-opened.
  const totalFor = (value) => {
    if (isBarbell) return totalBarbellWeight(barWeight, value);
    if (isDumbbell) return totalDumbbellWeight(value);
    return value;
  };
  const patchFor = (value, bar = barWeight) => {
    if (isBodyweight) return { addedWeight: value };
    if (isBarbell) {
      return { weight: totalBarbellWeight(bar, value), barWeight: bar, weightPerSide: value };
    }
    // `isPerHand` is both the label and the format marker that tells every
    // later reader this set's `weight` is the absolute pair, not one
    // dumbbell — see utils/setLoad.js.
    if (isDumbbell) return { weight: totalDumbbellWeight(value), perHandWeight: value, isPerHand: true };
    return { weight: value };
  };

  // A set with nothing entered yet gets its seeded guess written straight
  // away, so opening the sheet leaves it ready to check off. Barbell and
  // dumbbell sets ALSO write when the weight is already there but the
  // context isn't — an existing set that predates the calculator, or one
  // seeded from history, so the stored numbers match what is on screen
  // from the moment it opens rather than only once something is touched.
  useEffect(() => {
    const patch = {};
    const blank = (v) => v === '' || v === null || v === undefined;
    if (isBodyweight) {
      if (blank(addedWeight)) patch.addedWeight = load;
    } else if (blank(weight) || ((isBarbell || isDumbbell) && !hasContext)) {
      Object.assign(patch, patchFor(load));
    }
    if (blank(reps)) patch.reps = r;
    if (Object.keys(patch).length) onChange(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitLoad = (v) => {
    const c = isBodyweight ? nearestAdded(v) : isBarbell ? nearestPerSide(v) : nearestWorkingWeight(v);
    setLoad(c);
    onChange(patchFor(c));
  };

  // Swapping the bar keeps the plates on it and moves the total, which is
  // what physically happens when you carry your plates to the EZ bar.
  const commitBar = (nextId) => {
    setBarId(nextId);
    onChange(patchFor(load, getBarType(nextId).weight));
  };

  const addPlate = (plate) => commitLoad(Math.min(PER_SIDE_WEIGHTS[PER_SIDE_WEIGHTS.length - 1], load + plate));
  const clearBar = () => commitLoad(0);
  const commitR = (v) => {
    const c = clampR(v);
    setR(c);
    onChange({ reps: c });
  };

  const loadList = isBodyweight ? ADDED_WEIGHTS : isBarbell ? PER_SIDE_WEIGHTS : WORKING_WEIGHTS_KG;
  const stepLoad = (dir) => {
    const cur = isBodyweight ? nearestAdded(load) : isBarbell ? nearestPerSide(load) : nearestWorkingWeight(load);
    const i = loadList.indexOf(cur);
    const ni = Math.max(0, Math.min(loadList.length - 1, i + dir));
    commitLoad(loadList[ni]);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl bg-neutral-950 border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/10">
          <h2 className="text-lg font-bold text-neutral-50">Set {index + 1}</h2>
          <button type="button" onClick={onClose} className="text-neutral-500 text-2xl leading-none px-1" aria-label="Close">
            ✕
          </button>
        </div>

        {isBodyweight && (
          <p className="px-5 pt-3 text-xs text-neutral-500">
            Bodyweight exercise — Jimmy adds your body weight automatically. Just dial in any belt weight.
          </p>
        )}

        {/* Bar type. A horizontal scroller rather than a wrapping grid:
            six chips do not fit across 375px, and a row that reflows to
            two lines pushes the wheels below the fold on a small phone. */}
        {isBarbell && (
          <div className="px-5 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1.5">Bar</p>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {BAR_TYPES.map((bar) => {
                const on = bar.id === barId;
                return (
                  <button
                    key={bar.id}
                    type="button"
                    onClick={() => commitBar(bar.id)}
                    aria-pressed={on}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition active:scale-95 ${
                      on ? 'text-neutral-950' : 'border-white/10 bg-neutral-800 text-neutral-300'
                    }`}
                    style={on ? { background: 'var(--tier-accent)', borderColor: 'var(--tier-accent)' } : undefined}
                  >
                    {bar.label}
                    <span className={`ml-1 font-normal ${on ? 'opacity-70' : 'text-neutral-500'}`}>
                      {bar.weight}kg
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 px-5 py-5">
          <div className="flex flex-col items-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">
              {isBodyweight
                ? 'Added · kg'
                : isBarbell
                  ? 'Per side · kg'
                  : isDumbbell
                    ? 'Per hand · kg'
                    : 'Weight · kg'}
            </p>
            <WheelPicker
              className="w-full"
              value={load}
              options={isBodyweight ? addedOptions : isBarbell ? perSideOptions : weightOptions}
              onChange={commitLoad}
              ariaLabel={
                isBodyweight
                  ? 'Added weight in kilograms'
                  : isBarbell
                    ? 'Weight per side in kilograms'
                    : isDumbbell
                      ? 'Weight per hand in kilograms'
                      : 'Weight in kilograms'
              }
            />
            <Stepper onDown={() => stepLoad(-1)} onUp={() => stepLoad(1)}>
              {isBodyweight ? '± belt' : isBarbell ? '1.25 kg' : '1 kg'}
            </Stepper>
          </div>

          <div className="flex flex-col items-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">Reps</p>
            <WheelPicker
              className="w-full"
              value={r}
              min={REPS_MIN}
              max={REPS_MAX}
              step={1}
              onChange={commitR}
              ariaLabel="Reps"
            />
            <Stepper onDown={() => commitR(r - 1)} onUp={() => commitR(r + 1)}>
              1 rep
            </Stepper>
          </div>
        </div>

        {/* Plates + the running total. Below the wheels because the wheel
            is still the fast way to land on a number you already know;
            the plates are for building one up the way the bar is loaded. */}
        {isBarbell && (
          <div className="flex flex-col gap-2.5 px-5 pb-4">
            <PlateButtons onAdd={addPlate} onClear={clearBar} />
            <div className="flex items-baseline justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Total on bar</span>
              <span className="text-xl font-extrabold tabular-nums" style={{ color: 'var(--tier-accent)' }}>
                {formatPlate(totalFor(load))} kg
              </span>
            </div>
            {/* Shows the arithmetic rather than asserting it — the number
                above is what gets logged, and "20 + 40 × 2" is the one
                line that makes it checkable at a glance. */}
            <p className="text-center text-[11px] text-neutral-600">
              {barWeight} kg bar + {formatPlate(load)} × 2
            </p>
          </div>
        )}

        {isDumbbell && (
          <div className="px-5 pb-4">
            <div className="flex items-baseline justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Total lifted</span>
              <span className="text-xl font-extrabold tabular-nums" style={{ color: 'var(--tier-accent)' }}>
                {formatWorkingWeight(totalFor(load))} kg
              </span>
            </div>
            <p className="mt-1.5 text-center text-[11px] text-neutral-600">
              {formatWorkingWeight(load)} kg in each hand — both count toward your volume.
            </p>
          </div>
        )}

        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-[var(--success)] text-white font-semibold text-base py-3.5 rounded-2xl active:scale-[0.98] transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
