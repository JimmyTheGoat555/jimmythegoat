// Static exercise database, grouped by muscle group. This is the seed list;
// custom exercises added by the user merge on top of this array by id.

import { DEFAULT_WEIGHT_KG } from '../utils/units.js';
import { EXERCISE_GUIDES } from './exerciseGuides.js';

export const MUSCLE_GROUPS = [
  { id: 'chest', label: 'Chest', color: '#f97316' },
  { id: 'back', label: 'Back', color: '#22c55e' },
  { id: 'legs', label: 'Legs', color: '#3b82f6' },
  { id: 'shoulders', label: 'Shoulders', color: '#eab308' },
  { id: 'biceps', label: 'Biceps', color: '#a855f7' },
  { id: 'triceps', label: 'Triceps', color: '#ec4899' },
  { id: 'core', label: 'Core', color: '#14b8a6' },
];

// `isBodyweight: true` means the load is the lifter's own body weight
// (plus anything on a belt) rather than a number they enter. logWorkout
// scores these as (bodyWeight + addedWeight) * reps — see
// functions/economy.js, which keeps its own copy of the id list
// (functions/exercises.js) since it can't import this ESM module.
//
// `defaultWeightKg` is where the set sheet's wheel opens the FIRST time
// this exercise is logged, before there's a "last time" to copy. It used
// to be a flat 20 kg for everything, which is absurd in both directions
// at once — nobody benches 20, and nobody does lateral raises with it —
// so every first set started with a long spin in one direction or the
// other. Each number is a typical working weight for that movement, so
// the wheel opens near where most people land and one flick covers the
// rest. Dumbbell entries are PER DUMBBELL, the way a rack is labelled.
// Bodyweight exercises have none on purpose — their wheel is added belt
// weight, which correctly starts at 0.
//
// Only ever a first-set guess: the moment you have logged an exercise
// once, seedSetsFromHistory fills the row from YOUR last set instead and
// never consults this again (utils/lastPerformance.js).
//
// `movement` ('compound' = multi-joint, 'isolation' = single-joint) and the
// optional `sizeRank` override drive Jimmy's Priority sorting — see
// utils/exerciseSorting.js. sizeRank only appears where the muscle group
// would rank the exercise wrongly: calf raises are filed under legs but
// belong at the end of a session with the other small stuff, not in front
// of squats.
// `equipment` ('barbell' | 'dumbbell' | 'dumbbell-single' | 'machine' |
// 'cable' | 'bodyweight') drives the set sheet's input mode — the barbell
// plate calculator, the per-hand dumbbell label — and nothing else. It is
// never rendered anywhere. See utils/setLoad.js.
//
// 'dumbbell-single' is the ONE-IMPLEMENT variant: a single-arm row, a
// goblet squat, an overhead extension held in both hands. It exists
// because 'dumbbell' is not a description here, it is an instruction.
// isDumbbellExercise() matches that string exactly; the sheet then asks
// for the weight PER HAND and functions/economy.js's deriveWeight DOUBLES
// whatever it is given. That is correct for a dumbbell in each hand and
// wrong by 2x for one dumbbell — and a 2x error here is not cosmetic: it
// inflates volume, coins, lifetime totals and the leaderboard, breaks
// every stored best for the movement, and announces the fake PR to the
// lifter's friends.
//
// Anything that is not exactly 'dumbbell' falls through to the plain
// weight input, where the number entered IS the absolute load. So these
// entries need no special case in any component — and must NOT be added
// to functions/exercises.js's DUMBBELL_EXERCISE_IDS, which is the server
// half of the same instruction.
//
// `perHand: true` is the escape hatch for a movement that is loaded a
// side but is NOT a dumbbell: a cable crossover, where each hand pulls
// its own stack. It says exactly what `equipment: 'dumbbell'` says —
// "the number entered is one side, double it" — without lying about what
// the apparatus is, which matters because `equipment` also drives the
// input mode and the icon. isPerHandExercise() in utils/setLoad.js is
// the predicate that reads both; anything flagged here MUST also be in
// functions/exercises.js's per-hand id set, or the client and the server
// will disagree about what a logged number means.
//
// It is DESCRIPTIVE and is not the same question as `isBodyweight` above,
// which is the operative flag for scoring. Plank is the one place they
// disagree: its apparatus is bodyweight, but it is logged as a timed hold
// at a nominal 1 kg rather than scored against the lifter's mass, so it
// carries `equipment: 'bodyweight'` and NO `isBodyweight` flag. Do not
// "fix" that by adding plank to functions/exercises.js's
// BODYWEIGHT_EXERCISE_IDS — that would re-score every plank ever logged.
// `description` (a short paragraph) and `tips` (up to three one-line
// form cues) complete the schema. They live in exerciseGuides.js, keyed
// by id, and are folded onto each entry below — so every object in
// EXERCISES carries both, and a screen can read exercise.description
// without knowing where it came from. A custom exercise has the same two
// fields when the user gave it any (useExercises); the (i) and the bulb
// that show them simply stay hidden when they are absent.
const SEED = [
  // Chest
  {
    id: 'bench-press',
    name: 'Barbell Bench Press',
    muscleGroup: 'chest',
    defaultWeightKg: 80,
    movement: 'compound',
    equipment: 'barbell',
  },
  {
    id: 'incline-db-press',
    name: 'Incline Dumbbell Press',
    muscleGroup: 'chest',
    defaultWeightKg: 14,
    movement: 'compound',
    equipment: 'dumbbell',
  },
  {
    id: 'decline-bench-press',
    name: 'Decline Bench Press',
    muscleGroup: 'chest',
    defaultWeightKg: 70,
    movement: 'compound',
    equipment: 'barbell',
  },
  {
    id: 'chest-press-machine',
    name: 'Chest Press Machine',
    muscleGroup: 'chest',
    defaultWeightKg: 60,
    movement: 'compound',
    equipment: 'machine',
  },
  {
    id: 'chest-fly',
    name: 'Chest Fly',
    muscleGroup: 'chest',
    defaultWeightKg: 12,
    movement: 'isolation',
    equipment: 'dumbbell',
  },
  {
    id: 'pec-deck',
    name: 'Pec Deck Machine',
    muscleGroup: 'chest',
    defaultWeightKg: 45,
    movement: 'isolation',
    equipment: 'machine',
  },
  {
    id: 'push-up',
    name: 'Push-Up',
    muscleGroup: 'chest',
    isBodyweight: true,
    movement: 'compound',
    equipment: 'bodyweight',
  },
  { id: 'dips', name: 'Dips', muscleGroup: 'chest', isBodyweight: true, movement: 'compound', equipment: 'bodyweight' },
  {
    // PER HAND, despite being a cable. Two stacks, one in each hand, and
    // the number that matters to the lifter is the one pinned on a single
    // stack — so `perHand` is set and the load logged is doubled, exactly
    // as it is for a pair of dumbbells. See the `perHand` note above.
    //
    // `defaultWeightKg` is per hand too, like every dumbbell entry here:
    // 12 a side, 24 kg of actual load, which is a normal working crossover.
    id: 'cable-crossover',
    name: 'Cable Crossover',
    muscleGroup: 'chest',
    defaultWeightKg: 12,
    movement: 'isolation',
    equipment: 'cable',
    perHand: true,
  },

  // Back
  {
    id: 'deadlift',
    name: 'Deadlift',
    muscleGroup: 'back',
    defaultWeightKg: 60,
    movement: 'compound',
    equipment: 'barbell',
  },
  {
    id: 'barbell-row',
    name: 'Barbell Row',
    muscleGroup: 'back',
    defaultWeightKg: 40,
    movement: 'compound',
    equipment: 'barbell',
  },
  {
    id: 't-bar-row',
    name: 'T-Bar Row',
    muscleGroup: 'back',
    defaultWeightKg: 40,
    movement: 'compound',
    equipment: 'barbell',
  },
  // Single-ARM by name: one dumbbell, so the number entered is already the
  // whole load. See the 'dumbbell-single' note above.
  {
    id: 'db-row',
    name: 'Single-Arm Dumbbell Row',
    muscleGroup: 'back',
    defaultWeightKg: 22,
    movement: 'compound',
    equipment: 'dumbbell-single',
  },
  {
    id: 'pull-up',
    name: 'Pull-Up',
    muscleGroup: 'back',
    isBodyweight: true,
    movement: 'compound',
    equipment: 'bodyweight',
  },
  {
    id: 'chin-up',
    name: 'Chin-Up',
    muscleGroup: 'back',
    isBodyweight: true,
    movement: 'compound',
    equipment: 'bodyweight',
  },
  {
    id: 'lat-pulldown',
    name: 'Lat Pulldown',
    muscleGroup: 'back',
    defaultWeightKg: 40,
    movement: 'compound',
    equipment: 'machine',
  },
  {
    id: 'seated-cable-row',
    name: 'Seated Cable Row',
    muscleGroup: 'back',
    defaultWeightKg: 40,
    movement: 'compound',
    equipment: 'cable',
  },
  {
    id: 'straight-arm-pulldown',
    name: 'Straight-Arm Pulldown',
    muscleGroup: 'back',
    defaultWeightKg: 25,
    movement: 'isolation',
    equipment: 'cable',
  },

  // Legs
  { id: 'squat', name: 'Squat', muscleGroup: 'legs', defaultWeightKg: 50, movement: 'compound', equipment: 'barbell' },
  {
    id: 'bulgarian-split-squat',
    name: 'Bulgarian Split Squat',
    muscleGroup: 'legs',
    defaultWeightKg: 12,
    movement: 'compound',
    equipment: 'dumbbell',
  },
  {
    id: 'leg-press',
    name: 'Leg Press',
    muscleGroup: 'legs',
    defaultWeightKg: 80,
    movement: 'compound',
    equipment: 'machine',
  },
  {
    id: 'romanian-deadlift',
    name: 'Romanian Deadlift',
    muscleGroup: 'legs',
    defaultWeightKg: 40,
    movement: 'compound',
    equipment: 'barbell',
  },
  // One dumbbell held at the chest — that IS the movement's definition.
  {
    id: 'goblet-squat',
    name: 'Goblet Squat',
    muscleGroup: 'legs',
    defaultWeightKg: 20,
    movement: 'compound',
    equipment: 'dumbbell-single',
  },
  {
    id: 'leg-extension',
    name: 'Leg Extension',
    muscleGroup: 'legs',
    defaultWeightKg: 30,
    movement: 'isolation',
    equipment: 'machine',
  },
  {
    id: 'leg-curl',
    name: 'Leg Curl',
    muscleGroup: 'legs',
    defaultWeightKg: 25,
    movement: 'isolation',
    equipment: 'machine',
  },
  // sizeRank is NOT part of the expanded list's format and is kept anyway:
  // dropping it would let calf raises sort ahead of squats under Jimmy's
  // Priority (utils/exerciseSorting.js falls back to the muscle group's
  // own rank, and calves are filed under legs).
  {
    id: 'calf-raise',
    name: 'Calf Raise',
    muscleGroup: 'legs',
    defaultWeightKg: 40,
    movement: 'isolation',
    sizeRank: 4,
    equipment: 'machine',
  },
  // Glutes. The hip thrust is the loaded glute movement most programmes
  // are built around; the bridge is its floor-and-bodyweight cousin. Both
  // are what the Peach Builder badge counts (data/badges.js), and
  // functions/exercises.js carries their ids for the server's copies —
  // the bridge in the bodyweight set, the thrust in the barbell one.
  {
    id: 'hip-thrust',
    name: 'Hip Thrust',
    muscleGroup: 'legs',
    defaultWeightKg: 40,
    movement: 'compound',
    equipment: 'barbell',
  },
  {
    id: 'glute-bridge',
    name: 'Glute Bridge',
    muscleGroup: 'legs',
    isBodyweight: true,
    movement: 'compound',
    equipment: 'bodyweight',
  },

  // Shoulders
  {
    id: 'overhead-press',
    name: 'Overhead Press',
    muscleGroup: 'shoulders',
    defaultWeightKg: 25,
    movement: 'compound',
    equipment: 'barbell',
  },
  {
    id: 'arnold-press',
    name: 'Arnold Press',
    muscleGroup: 'shoulders',
    defaultWeightKg: 14,
    movement: 'compound',
    equipment: 'dumbbell',
  },
  {
    id: 'lateral-raise',
    name: 'Lateral Raise',
    muscleGroup: 'shoulders',
    defaultWeightKg: 7.5,
    movement: 'isolation',
    equipment: 'dumbbell',
  },
  {
    id: 'front-raise',
    name: 'Front Raise',
    muscleGroup: 'shoulders',
    defaultWeightKg: 7.5,
    movement: 'isolation',
    equipment: 'dumbbell',
  },
  {
    id: 'rear-delt-fly',
    name: 'Rear Delt Fly',
    muscleGroup: 'shoulders',
    defaultWeightKg: 7.5,
    movement: 'isolation',
    equipment: 'dumbbell',
  },
  {
    id: 'face-pull',
    name: 'Face Pull',
    muscleGroup: 'shoulders',
    defaultWeightKg: 20,
    movement: 'isolation',
    equipment: 'cable',
  },
  {
    id: 'shrug',
    name: 'Shrug',
    muscleGroup: 'shoulders',
    defaultWeightKg: 40,
    movement: 'isolation',
    equipment: 'dumbbell',
  },

  // Biceps
  {
    id: 'barbell-curl',
    name: 'Barbell Curl',
    muscleGroup: 'biceps',
    defaultWeightKg: 20,
    movement: 'isolation',
    equipment: 'barbell',
  },
  {
    id: 'db-curl',
    name: 'Dumbbell Curl',
    muscleGroup: 'biceps',
    defaultWeightKg: 10,
    movement: 'isolation',
    equipment: 'dumbbell',
  },
  {
    id: 'hammer-curl',
    name: 'Hammer Curl',
    muscleGroup: 'biceps',
    defaultWeightKg: 10,
    movement: 'isolation',
    equipment: 'dumbbell',
  },
  {
    id: 'preacher-curl',
    name: 'Preacher Curl',
    muscleGroup: 'biceps',
    defaultWeightKg: 15,
    movement: 'isolation',
    equipment: 'barbell',
  },
  {
    id: 'incline-db-curl',
    name: 'Incline Dumbbell Curl',
    muscleGroup: 'biceps',
    defaultWeightKg: 10,
    movement: 'isolation',
    equipment: 'dumbbell',
  },

  // Triceps
  {
    id: 'triceps-pushdown',
    name: 'Triceps Pushdown',
    muscleGroup: 'triceps',
    defaultWeightKg: 20,
    movement: 'isolation',
    equipment: 'cable',
  },
  {
    id: 'skull-crusher',
    name: 'Skull Crusher',
    muscleGroup: 'triceps',
    defaultWeightKg: 20,
    movement: 'isolation',
    equipment: 'barbell',
  },
  {
    id: 'close-grip-bench',
    name: 'Close-Grip Bench Press',
    muscleGroup: 'triceps',
    defaultWeightKg: 30,
    movement: 'compound',
    equipment: 'barbell',
  },
  {
    id: 'triceps-dip',
    name: 'Triceps Dip',
    muscleGroup: 'triceps',
    isBodyweight: true,
    movement: 'compound',
    equipment: 'bodyweight',
  },
  // The most arguable of the three singles: done with one dumbbell in both
  // hands as often as with two. Filed as one, which is the version the
  // 14 kg default suits — flip it to 'dumbbell' if you mean a pair.
  {
    id: 'overhead-db-extension',
    name: 'Overhead Dumbbell Extension',
    muscleGroup: 'triceps',
    defaultWeightKg: 14,
    movement: 'isolation',
    equipment: 'dumbbell-single',
  },

  // Core
  // Plank is a timed hold, which this log can't express — it still wants a
  // number, so it gets the lightest one rather than a fictional load.
  {
    id: 'plank',
    name: 'Plank',
    muscleGroup: 'core',
    defaultWeightKg: 1,
    movement: 'isolation',
    equipment: 'bodyweight',
  },
  {
    id: 'hanging-leg-raise',
    name: 'Hanging Leg Raise',
    muscleGroup: 'core',
    isBodyweight: true,
    movement: 'isolation',
    equipment: 'bodyweight',
  },
  {
    id: 'ab-wheel',
    name: 'Ab Wheel Rollout',
    muscleGroup: 'core',
    isBodyweight: true,
    movement: 'isolation',
    equipment: 'bodyweight',
  },
  {
    id: 'cable-crunch',
    name: 'Cable Crunch',
    muscleGroup: 'core',
    defaultWeightKg: 20,
    movement: 'isolation',
    equipment: 'cable',
  },
  {
    id: 'russian-twist',
    name: 'Russian Twist',
    muscleGroup: 'core',
    defaultWeightKg: 5,
    movement: 'isolation',
    equipment: 'dumbbell',
  },
];

export const EXERCISES = SEED.map((exercise) => ({ ...exercise, ...(EXERCISE_GUIDES[exercise.id] ?? {}) }));

export function exercisesByGroup(groupId) {
  return EXERCISES.filter((exercise) => exercise.muscleGroup === groupId);
}

export function getExercise(id) {
  return EXERCISES.find((exercise) => exercise.id === id);
}

// Seed-list only — a user's custom exercise can't be flagged bodyweight
// yet, so it's logged with an entered weight like any other.
export function isBodyweightExercise(id) {
  return getExercise(id)?.isBodyweight === true;
}

// The weight field's placeholder, and where its +/- stepper starts, for
// an exercise nobody has logged before (SetRow). A set seeded from YOUR
// own history wins over this whenever there is one. A custom exercise has
// no entry here and falls back to the flat default.
export function defaultWeightForExercise(id) {
  return getExercise(id)?.defaultWeightKg ?? DEFAULT_WEIGHT_KG;
}

export function getMuscleGroup(id) {
  return MUSCLE_GROUPS.find((group) => group.id === id);
}
