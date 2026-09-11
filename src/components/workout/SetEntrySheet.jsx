import { useEffect, useMemo, useState } from 'react';
import WheelPicker from '../shared/WheelPicker';
import {
  DEFAULT_REPS,
  DEFAULT_WEIGHT_KG,
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
  isBodyweight = false,
  weight,
  addedWeight,
  reps,
  lastSet,
  onChange,
  onClose,
}) {
  const weightOptions = useMemo(
    () => WORKING_WEIGHTS_KG.map((v) => ({ value: v, label: formatWorkingWeight(v) })),
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
    const n = Number(weight);
    if (Number.isFinite(n) && n > 0) return nearestWorkingWeight(n);
    const last = Number(lastSet?.weight);
    return nearestWorkingWeight(Number.isFinite(last) && last > 0 ? last : DEFAULT_WEIGHT_KG);
  };
  const seedR = () => {
    const n = Number(reps);
    if (Number.isInteger(n) && n > 0) return clampR(n);
    const last = Number(lastSet?.reps);
    return clampR(Number.isFinite(last) && last > 0 ? last : DEFAULT_REPS);
  };

  const [load, setLoad] = useState(seedLoad); // working weight, OR added weight when isBodyweight
  const [r, setR] = useState(seedR);

  // A set with nothing entered yet gets its seeded guess written straight
  // away, so opening the sheet leaves it ready to check off.
  useEffect(() => {
    const patch = {};
    if (isBodyweight) {
      if (addedWeight === '' || addedWeight === null || addedWeight === undefined) patch.addedWeight = load;
    } else if (weight === '' || weight === null || weight === undefined) {
      patch.weight = load;
    }
    if (reps === '' || reps === null || reps === undefined) patch.reps = r;
    if (Object.keys(patch).length) onChange(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitLoad = (v) => {
    const c = isBodyweight ? nearestAdded(v) : nearestWorkingWeight(v);
    setLoad(c);
    onChange(isBodyweight ? { addedWeight: c } : { weight: c });
  };
  const commitR = (v) => {
    const c = clampR(v);
    setR(c);
    onChange({ reps: c });
  };

  const loadList = isBodyweight ? ADDED_WEIGHTS : WORKING_WEIGHTS_KG;
  const stepLoad = (dir) => {
    const cur = isBodyweight ? nearestAdded(load) : nearestWorkingWeight(load);
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

        <div className="grid grid-cols-2 gap-3 px-5 py-5">
          <div className="flex flex-col items-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">
              {isBodyweight ? 'Added · kg' : 'Weight · kg'}
            </p>
            <WheelPicker
              className="w-full"
              value={load}
              options={isBodyweight ? addedOptions : weightOptions}
              onChange={commitLoad}
              ariaLabel={isBodyweight ? 'Added weight in kilograms' : 'Weight in kilograms'}
            />
            <Stepper onDown={() => stepLoad(-1)} onUp={() => stepLoad(1)}>
              {isBodyweight ? '± belt' : '1 kg'}
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
