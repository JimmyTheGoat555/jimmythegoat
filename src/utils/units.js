// Shared numeric bounds + helpers for weight/rep entry (the wheel picker,
// SetRow, SetEntrySheet, and the body-weight log).
//
// Two different precisions on purpose:
//   - BODY weigh-ins (ProfileView / logBodyWeight) round to 0.1 kg —
//     people care about a 0.3 kg swing.
//   - WORKING weights in a logged set step in 1 kg, plus the half-kg
//     dumbbell/plate combos that actually exist on a rack
//     (7.5, 12.5, 17.5, 22.5, 27.5). No 62.4 kg bench sets.
//
// NOTE: the kg/lbs (and cm/in) unit SYSTEM — a stored `unitSystem`
// preference plus conversion at every display site — is still a separate,
// larger change. Today everything stored and shown is kg; this file is
// where that work will hang off.

export const WEIGHT_MIN_KG = 1; // matches functions/storeCatalog.js MIN_WEIGHT_KG
export const WEIGHT_MAX_KG = 250; // matches MAX_WEIGHT_KG
export const REPS_MIN = 1;
export const REPS_MAX = 30;

// Sensible starting points when a set has nothing entered yet and there's
// no "last time" to copy from.
export const DEFAULT_WEIGHT_KG = 20;
export const DEFAULT_REPS = 8;

// The wheel's weight values: every whole kg from 1 to 250, with the
// half-kg rack combos (7.5 / 12.5 / 17.5 / 22.5 / 27.5) inserted where
// they belong. ~255 entries, so the wheel is light and easy to spin to a
// target (a 0.1-step list would be 2500).
const HALF_KG_WEIGHTS = [7.5, 12.5, 17.5, 22.5, 27.5];
export const WORKING_WEIGHTS_KG = (() => {
  const out = [];
  for (let kg = WEIGHT_MIN_KG; kg <= WEIGHT_MAX_KG; kg += 1) {
    out.push(kg);
    if (HALF_KG_WEIGHTS.includes(kg + 0.5)) out.push(kg + 0.5);
  }
  return out;
})();

// "60" for whole kg, "7.5" for the halves — never "60.0".
export function formatWorkingWeight(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

// Snaps an arbitrary weight (a "last time" value, a trainer-assigned
// number) to the nearest value the wheel actually offers.
export function nearestWorkingWeight(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return DEFAULT_WEIGHT_KG;
  return WORKING_WEIGHTS_KG.reduce((best, v) =>
    Math.abs(v - num) < Math.abs(best - num) ? v : best,
  );
}

// One decimal place, free of float noise (0.1 * 3 !== 0.3) — for BODY
// weigh-ins. functions/economy.js rounds a submitted working weight the
// same way as a backstop against a client sending finer precision.
export function roundToTenth(n) {
  const num = Number(n);
  return Number.isFinite(num) ? Math.round(num * 10) / 10 : num;
}
