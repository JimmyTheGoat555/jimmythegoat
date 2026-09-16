// How a set's ABSOLUTE load relates to what the lifter actually typed.
//
// One module, shared by the input sheet, the volume maths and the PR
// comparison, because the single most expensive bug available here is two
// of those three disagreeing about what a number means.
//
// ── The contract ────────────────────────────────────────────────────────
//
// `set.weight` is ALWAYS the absolute load in kg, and always has been:
//   • barbell  — the whole loaded bar (bar + both sides)
//   • machine/cable — what the stack says
//   • bodyweight — body weight + belt (folded in server-side)
// Everything downstream — volume, relative score, PRs, the leaderboard,
// every feed post ever written — reads that one field and nothing else.
// That is why the calculator below is a keypad, not a new storage format:
// it changes how the number is REACHED, never what it is.
//
// ── The one exception, and the reason this file has a compatibility rule ─
//
// Dumbbells were the exception. src/data/exercises.js still says it out
// loud: "Dumbbell entries are PER DUMBBELL, the way a rack is labelled."
// So a 25 kg dumbbell press has always been stored as `weight: 25`, and
// scored as 25 × reps — half the load that was actually moved.
//
// New dumbbell sets store the true absolute load (50) and carry
// `isPerHand: true` plus `perHandWeight: 25` so the sheet can re-open
// showing 25, the number written on the dumbbell.
//
// `isPerHand` is therefore a FORMAT MARKER as much as a label, and the
// rules below follow from that:
//
//   • A dumbbell set WITH isPerHand → weight is absolute. Nothing to do.
//   • A dumbbell set WITHOUT it → logged under the old convention. Its
//     weight is per-hand and is LEFT ALONE.
//
// Leaving legacy sets alone is the deliberate part. Doubling them at read
// time would be more "correct" and would silently rewrite every past
// workout, every progress chart and every lifetime total the day it
// shipped. Old sessions keep the numbers they were logged with; new ones
// are right. The only visible artifact is that a lifter's first dumbbell
// session after this ships will beat its own stored best — which is why
// functions/economy.js normalizes the stored bests once per account.

import { getExercise } from '../data/exercises';

export const EQUIPMENT = {
  BARBELL: 'barbell',
  DUMBBELL: 'dumbbell',
  // One implement, held in one hand or in both: a single-arm row, a goblet
  // squat. Listed here so the taxonomy has one home, and deliberately NOT
  // matched by isDumbbellExercise below — the whole point of the value is
  // that the number entered is already the absolute load, so it takes the
  // plain weight input and is never doubled. See src/data/exercises.js.
  DUMBBELL_SINGLE: 'dumbbell-single',
  MACHINE: 'machine',
  CABLE: 'cable',
  BODYWEIGHT: 'bodyweight',
};

// Custom exercises (added by the user) carry no equipment, and neither did
// any seed entry before this feature — both fall through to the plain
// weight input, which is exactly the behaviour they had. So does
// DUMBBELL_SINGLE, on purpose.
export function equipmentOf(exerciseId) {
  return getExercise(exerciseId)?.equipment ?? null;
}

export function isBarbellExercise(exerciseId) {
  return equipmentOf(exerciseId) === EQUIPMENT.BARBELL;
}

export function isDumbbellExercise(exerciseId) {
  return equipmentOf(exerciseId) === EQUIPMENT.DUMBBELL;
}

// bar + both sides. The one formula the calculator exists to apply.
export function totalBarbellWeight(barWeight, weightPerSide) {
  const bar = Number(barWeight) || 0;
  const side = Number(weightPerSide) || 0;
  return Math.round((bar + side * 2) * 10) / 10;
}

export function totalDumbbellWeight(perHandWeight) {
  return Math.round((Number(perHandWeight) || 0) * 2 * 10) / 10;
}

// What the sheet should show in the "per hand" wheel when re-opening an
// existing set — the inverse of the rule at the top of this file.
export function perHandFromSet(set) {
  const stored = Number(set?.perHandWeight);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const weight = Number(set?.weight) || 0;
  // New format: weight is absolute, so half of it is one dumbbell.
  if (set?.isPerHand === true) return Math.round((weight / 2) * 10) / 10;
  // Legacy: the stored number already IS one dumbbell.
  return weight;
}

// Same idea for the bar: prefer what was stored, fall back to solving the
// formula. A set logged before the calculator existed has neither field,
// so its `weight` is treated as a fully loaded Olympic bar — the only
// assumption available, and the one that reproduces the same total.
export function perSideFromSet(set, barWeight) {
  const stored = Number(set?.weightPerSide);
  if (Number.isFinite(stored) && stored >= 0 && set?.weightPerSide !== '') return stored;
  const total = Number(set?.weight) || 0;
  const bar = Number(barWeight) || 0;
  return Math.max(0, Math.round(((total - bar) / 2) * 10) / 10);
}

// True only for a set logged under the new per-hand format. Deliberately
// NOT "is this a dumbbell exercise" — a legacy dumbbell set stores its
// per-hand number in `weight` with no marker, and treating it as the new
// format would halve it on screen.
export function isPerHandSet(set) {
  return set?.isPerHand === true;
}

// The number every downstream calculation should use for a set. Identical
// to `set.weight` in every case today — it exists so that the compatibility
// rule has exactly one home, and so a future migration of legacy dumbbell
// sets is a change to this function rather than a hunt through five files.
export function absoluteSetWeight(set) {
  return Number(set?.weight) || 0;
}
