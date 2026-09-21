// Shared numeric bounds + helpers for weight/rep entry (the set row's
// weight and reps, the wheel they open, and the body-weight log).
//
// Two different precisions on purpose:
//   - BODY weigh-ins (ProfileView / logBodyWeight) round to 0.1 kg —
//     people care about a 0.3 kg swing.
//   - WORKING weights in a logged set step in 0.5 kg (SetRow's stepper),
//     the smallest increment that exists on a real rack.
//
// The ladders that used to live here — WORKING_WEIGHTS_KG's whole kilos
// with the half-kg rack combos, and TOTAL_WEIGHTS_KG's every-half-kilo
// override list — were the old scroll wheels' option lists. The wheel is
// still here (components/workout/SetEntrySheet.jsx) but it builds its own
// range from min/max/step now, in 0.5 kg all the way up, so that every
// value the stepper can produce exists on it. A number TYPED into that
// sheet (double-tap a dial) is snapped onto the same 0.5 kg ladder, so
// the wheel cannot move it on the way back. Nothing reads a ladder from
// here any more, so the one left below is only the enumeration the tests
// walk.
//
// NOTE: the kg/lbs (and cm/in) unit SYSTEM — a stored `unitSystem`
// preference plus conversion at every display site — is still a separate,
// larger change. Today everything stored and shown is kg; this file is
// where that work will hang off.

export const WEIGHT_MIN_KG = 1; // matches functions/storeCatalog.js MIN_WEIGHT_KG
export const WEIGHT_MAX_KG = 250; // matches MAX_WEIGHT_KG
export const REPS_MIN = 1;
export const REPS_MAX = 30;

// The starting point when a set has nothing entered yet and there's no
// "last time" to copy from.
//
// DEFAULT_WEIGHT_KG is only the last-resort fallback — for anything in the
// seed catalog the weight field starts from that exercise's own
// `defaultWeightKg` instead (see data/exercises.js), since one flat number
// can't be right for both a bench press and a lateral raise. This value
// still covers a user's own custom exercises, which have no entry there.
export const DEFAULT_WEIGHT_KG = 20;

// Every whole kg from 1 to 250 with the half-kg rack combos (7.5 / 12.5 /
// 17.5 / 22.5 / 27.5) inserted where they belong — the weights a metric
// rack actually holds. Nothing in the app renders this any more; it is
// the enumeration tools/setLoad.test.mjs walks to check that every
// plausible entry survives the client → server round trip.
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

// One decimal place, free of float noise (0.1 * 3 !== 0.3) — for BODY
// weigh-ins. functions/economy.js rounds a submitted working weight the
// same way as a backstop against a client sending finer precision.
export function roundToTenth(n) {
  const num = Number(n);
  return Number.isFinite(num) ? Math.round(num * 10) / 10 : num;
}
