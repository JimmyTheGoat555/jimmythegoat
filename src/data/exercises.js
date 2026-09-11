// Static exercise database, grouped by muscle group. This is the seed list;
// custom exercises added by the user merge on top of this array by id.

import { DEFAULT_WEIGHT_KG } from '../utils/units';

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
// once, SetEntrySheet seeds from YOUR last set instead and never consults
// this again.
//
// `movement` ('compound' = multi-joint, 'isolation' = single-joint) and the
// optional `sizeRank` override drive Jimmy's Priority sorting — see
// utils/exerciseSorting.js. sizeRank only appears where the muscle group
// would rank the exercise wrongly: calf raises are filed under legs but
// belong at the end of a session with the other small stuff, not in front
// of squats.
export const EXERCISES = [
  // Chest
  { id: 'bench-press', name: 'Barbell Bench Press', muscleGroup: 'chest', defaultWeightKg: 80, movement: 'compound' },
  { id: 'incline-db-press', name: 'Incline Dumbbell Press', muscleGroup: 'chest', defaultWeightKg: 14, movement: 'compound' },
  { id: 'chest-fly', name: 'Chest Fly', muscleGroup: 'chest', defaultWeightKg: 12, movement: 'isolation' },
  { id: 'push-up', name: 'Push-Up', muscleGroup: 'chest', isBodyweight: true, movement: 'compound' },
  { id: 'dips', name: 'Dips', muscleGroup: 'chest', isBodyweight: true, movement: 'compound' },
  { id: 'cable-crossover', name: 'Cable Crossover', muscleGroup: 'chest', defaultWeightKg: 12, movement: 'isolation' },

  // Back
  { id: 'deadlift', name: 'Deadlift', muscleGroup: 'back', defaultWeightKg: 60, movement: 'compound' },
  { id: 'pull-up', name: 'Pull-Up', muscleGroup: 'back', isBodyweight: true, movement: 'compound' },
  { id: 'chin-up', name: 'Chin-Up', muscleGroup: 'back', isBodyweight: true, movement: 'compound' },
  { id: 'barbell-row', name: 'Barbell Row', muscleGroup: 'back', defaultWeightKg: 40, movement: 'compound' },
  { id: 'lat-pulldown', name: 'Lat Pulldown', muscleGroup: 'back', defaultWeightKg: 40, movement: 'compound' },
  { id: 'seated-cable-row', name: 'Seated Cable Row', muscleGroup: 'back', defaultWeightKg: 40, movement: 'compound' },

  // Legs
  { id: 'squat', name: 'Squat', muscleGroup: 'legs', defaultWeightKg: 50, movement: 'compound' },
  { id: 'leg-press', name: 'Leg Press', muscleGroup: 'legs', defaultWeightKg: 80, movement: 'compound' },
  { id: 'romanian-deadlift', name: 'Romanian Deadlift', muscleGroup: 'legs', defaultWeightKg: 40, movement: 'compound' },
  { id: 'leg-extension', name: 'Leg Extension', muscleGroup: 'legs', defaultWeightKg: 30, movement: 'isolation' },
  { id: 'leg-curl', name: 'Leg Curl', muscleGroup: 'legs', defaultWeightKg: 25, movement: 'isolation' },
  { id: 'calf-raise', name: 'Calf Raise', muscleGroup: 'legs', defaultWeightKg: 40, movement: 'isolation', sizeRank: 4 },

  // Shoulders
  { id: 'overhead-press', name: 'Overhead Press', muscleGroup: 'shoulders', defaultWeightKg: 25, movement: 'compound' },
  { id: 'lateral-raise', name: 'Lateral Raise', muscleGroup: 'shoulders', defaultWeightKg: 7.5, movement: 'isolation' },
  { id: 'front-raise', name: 'Front Raise', muscleGroup: 'shoulders', defaultWeightKg: 7.5, movement: 'isolation' },
  { id: 'rear-delt-fly', name: 'Rear Delt Fly', muscleGroup: 'shoulders', defaultWeightKg: 7.5, movement: 'isolation' },
  { id: 'shrug', name: 'Shrug', muscleGroup: 'shoulders', defaultWeightKg: 40, movement: 'isolation' },

  // Biceps
  { id: 'barbell-curl', name: 'Barbell Curl', muscleGroup: 'biceps', defaultWeightKg: 20, movement: 'isolation' },
  { id: 'db-curl', name: 'Dumbbell Curl', muscleGroup: 'biceps', defaultWeightKg: 10, movement: 'isolation' },
  { id: 'hammer-curl', name: 'Hammer Curl', muscleGroup: 'biceps', defaultWeightKg: 10, movement: 'isolation' },
  { id: 'preacher-curl', name: 'Preacher Curl', muscleGroup: 'biceps', defaultWeightKg: 15, movement: 'isolation' },

  // Triceps
  { id: 'triceps-pushdown', name: 'Triceps Pushdown', muscleGroup: 'triceps', defaultWeightKg: 20, movement: 'isolation' },
  { id: 'skull-crusher', name: 'Skull Crusher', muscleGroup: 'triceps', defaultWeightKg: 20, movement: 'isolation' },
  { id: 'close-grip-bench', name: 'Close-Grip Bench Press', muscleGroup: 'triceps', defaultWeightKg: 30, movement: 'compound' },
  { id: 'triceps-dip', name: 'Triceps Dip', muscleGroup: 'triceps', isBodyweight: true, movement: 'compound' },

  // Core
  // Plank is a timed hold, which this log can't express — it still wants a
  // number, so it gets the lightest one rather than a fictional load.
  { id: 'plank', name: 'Plank', muscleGroup: 'core', defaultWeightKg: 1, movement: 'isolation' },
  { id: 'hanging-leg-raise', name: 'Hanging Leg Raise', muscleGroup: 'core', isBodyweight: true, movement: 'isolation' },
  { id: 'cable-crunch', name: 'Cable Crunch', muscleGroup: 'core', defaultWeightKg: 20, movement: 'isolation' },
  { id: 'russian-twist', name: 'Russian Twist', muscleGroup: 'core', defaultWeightKg: 5, movement: 'isolation' },
];

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

// Where the set sheet's weight wheel opens for an exercise nobody has
// logged before (see SetEntrySheet's seedLoad, which prefers YOUR last set
// over this whenever there is one). A custom exercise has no entry here
// and falls back to the flat default.
export function defaultWeightForExercise(id) {
  return getExercise(id)?.defaultWeightKg ?? DEFAULT_WEIGHT_KG;
}

export function getMuscleGroup(id) {
  return MUSCLE_GROUPS.find((group) => group.id === id);
}
