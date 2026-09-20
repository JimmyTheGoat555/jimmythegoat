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

import { getExercise } from '../data/exercises.js';

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

// Kept as part of the taxonomy even though nothing branches on it any
// more: the plate calculator was the only reader, and the server's
// BARBELL_EXERCISE_IDS is now the only place a bar means anything (it
// still honours the context an un-reloaded old client sends).
export function isBarbellExercise(exerciseId) {
  return equipmentOf(exerciseId) === EQUIPMENT.BARBELL;
}

export function isDumbbellExercise(exerciseId) {
  return equipmentOf(exerciseId) === EQUIPMENT.DUMBBELL;
}

// The real question every calculation below is asking: is the number the
// lifter types ONE SIDE of a pair, to be doubled? That is true of a pair
// of dumbbells, and it is true of a cable crossover, where each hand pulls
// its own stack — but the crossover's `equipment` is 'cable', because that
// is what it is, and `equipment` also picks the input mode and the icon.
//
// So the catalog carries an explicit `perHand: true` for the second case
// (src/data/exercises.js) and this predicate reads both. It is the one
// that smartEntryKind, totalPatchFor and entryTotalOf consult;
// isDumbbellExercise above is now only "is the apparatus a dumbbell",
// which is a different and much less useful question.
//
// Its server twin is DUMBBELL_EXERCISE_IDS in functions/exercises.js. The
// two MUST list the same movements: the client writes `perHandWeight` and
// the server doubles it, so a movement flagged on one side only is scored
// at half or twice the load actually lifted.
export function isPerHandExercise(exerciseId) {
  if (equipmentOf(exerciseId) === EQUIPMENT.DUMBBELL) return true;
  return getExercise(exerciseId)?.perHand === true;
}

export function totalDumbbellWeight(perHandWeight) {
  return Math.round((Number(perHandWeight) || 0) * 2 * 10) / 10;
}

// What the per-hand field and the per-hand wheel should show when
// re-opening an existing set — the inverse of the rule at the top of this
// file.
export function perHandFromSet(set) {
  const stored = Number(set?.perHandWeight);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const weight = Number(set?.weight) || 0;
  // New format: weight is absolute, so half of it is one dumbbell.
  if (set?.isPerHand === true) return Math.round((weight / 2) * 10) / 10;
  // Legacy: the stored number already IS one dumbbell.
  return weight;
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

// ── Entry modes: per hand, or the whole number ──────────────────────────
//
// How the input ASKS for a weight is a separate question from what it
// stores. There used to be three ways of asking — plates per side on a
// bar, per hand, the total — and the barbell one is gone with the plate
// calculator. Two remain, and each can be reached either by typing or on
// the wheel (components/workout/SetRow.jsx and SetEntrySheet.jsx); both
// write through the same two patch builders below.
//
// The lifter can still force a per-hand exercise to TOTAL ("I know the
// whole load"). That choice is a device preference keyed by exercise
// (hooks/useWeightEntryModes.js). It changes the label and the icon, and
// NOTHING about the stored set: the contract at the top of this file
// holds in both modes — `weight` is the absolute load, and the context
// fields beside it always agree with it. The two patch builders below are
// where that is made true.

export const ENTRY_MODE_SMART = 'smart';
export const ENTRY_MODE_TOTAL = 'total';

export const ENTRY_KIND = {
  PER_HAND: 'perHand', // one implement of the pair
  TOTAL: 'total', // the whole load, as one number
  BODYWEIGHT: 'bodyweight', // body weight, plus any belt
};

// What the input asks for, left to itself.
export function smartEntryKind(exerciseId, isBodyweight = false) {
  if (isBodyweight) return ENTRY_KIND.BODYWEIGHT;
  if (isPerHandExercise(exerciseId)) return ENTRY_KIND.PER_HAND;
  return ENTRY_KIND.TOTAL;
}

// Whether the override toggle has anything to switch. A machine, a plain
// cable, a barbell, a single dumbbell or a custom exercise all take the
// total already, so offering "switch to total" there would be a button
// that does nothing.
export function hasSmartCalculator(exerciseId, isBodyweight = false) {
  return smartEntryKind(exerciseId, isBodyweight) === ENTRY_KIND.PER_HAND;
}

export function entryKindFor(exerciseId, { isBodyweight = false, mode = ENTRY_MODE_SMART } = {}) {
  if (mode === ENTRY_MODE_TOTAL && hasSmartCalculator(exerciseId, isBodyweight)) return ENTRY_KIND.TOTAL;
  return smartEntryKind(exerciseId, isBodyweight);
}

// ── Clearing stale context is not optional ──────────────────────────────
//
// `barWeight` / `weightPerSide` were written by the plate calculator, and
// functions/economy.js's deriveWeight STILL PREFERS THEM over `weight`
// when they are present and add up — it has to, because a client that has
// not reloaded since the calculator was removed is still sending them.
//
// Which means a set carrying a stale pair is a set whose typed weight is
// ignored: seed a new session from a barbell workout logged last month,
// type 110 over the 100 that came with it, and the server scores 100,
// silently, because 20 + 40 × 2 still adds up. So every patch this file
// produces names all four context fields and blanks the ones that do not
// apply.
//
// `undefined`, not null: Number(null) is 0, which the server would read as
// "an empty bar, nothing on it". An undefined key is dropped by JSON at
// every boundary (the localStorage draft, the callable payload) and reads
// as NaN everywhere else, which every consumer treats as "no context".
const NO_BAR = { barWeight: undefined, weightPerSide: undefined };
const NOT_PER_HAND = { perHandWeight: undefined, isPerHand: undefined };

// The patch for a set whose lifter typed ONE SIDE — one dumbbell of the
// pair, one stack of a crossover. `weight` is the pair, because `weight`
// is always the absolute load; `isPerHand` is both the label and the
// format marker that tells every later reader so.
export function perHandPatchFor(perHand) {
  const value = Math.round((Number(perHand) || 0) * 100) / 100;
  return { weight: totalDumbbellWeight(value), perHandWeight: value, isPerHand: true, ...NO_BAR };
}

// The patch for a set whose lifter typed the TOTAL. Its whole job is to
// keep the stored set indistinguishable from one written per hand:
//
//   • per hand — functions/economy.js doubles EVERY number it is handed
//     for these (per-hand is the convention there, marker or not), so a
//     bare `weight: 50` would be scored as 100. The set therefore still
//     says `isPerHand: true, perHandWeight: 25`, which the server doubles
//     back to exactly 50. The marker is telling the truth: `weight` IS
//     the absolute load.
//   • everything else — the number is the load. Nothing to reconcile,
//     beyond blanking whatever context came with it (see NO_BAR above).
export function totalPatchFor(exerciseId, total) {
  const weight = Math.round((Number(total) || 0) * 10) / 10;
  if (isPerHandExercise(exerciseId)) {
    return { weight, perHandWeight: Math.round((weight / 2) * 100) / 100, isPerHand: true, ...NO_BAR };
  }
  return { weight, ...NO_BAR, ...NOT_PER_HAND };
}

// The whole load a set represents, for the number under every weight
// field. Differs from absoluteSetWeight in ONE case, on purpose: a legacy
// per-hand set (no marker) stores one implement, and the pair is what the
// lifter is about to check against. absoluteSetWeight leaves legacy sets
// alone because it feeds stored totals; this feeds a number on screen.
export function entryTotalOf(set, exerciseId) {
  if (isPerHandExercise(exerciseId)) return totalDumbbellWeight(perHandFromSet(set));
  return absoluteSetWeight(set);
}
