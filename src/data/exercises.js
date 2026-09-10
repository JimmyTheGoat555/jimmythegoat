// Static exercise database, grouped by muscle group. This is the seed list;
// custom exercises added by the user merge on top of this array by id.

export const MUSCLE_GROUPS = [
  { id: 'chest', label: 'Chest', color: '#f97316' },
  { id: 'back', label: 'Back', color: '#22c55e' },
  { id: 'legs', label: 'Legs', color: '#3b82f6' },
  { id: 'shoulders', label: 'Shoulders', color: '#eab308' },
  { id: 'biceps', label: 'Biceps', color: '#a855f7' },
  { id: 'triceps', label: 'Triceps', color: '#ec4899' },
  { id: 'core', label: 'Core', color: '#14b8a6' },
];

export const EXERCISES = [
  // Chest
  { id: 'bench-press', name: 'Barbell Bench Press', muscleGroup: 'chest' },
  { id: 'incline-db-press', name: 'Incline Dumbbell Press', muscleGroup: 'chest' },
  { id: 'chest-fly', name: 'Chest Fly', muscleGroup: 'chest' },
  { id: 'dips', name: 'Dips', muscleGroup: 'chest' },
  { id: 'cable-crossover', name: 'Cable Crossover', muscleGroup: 'chest' },

  // Back
  { id: 'deadlift', name: 'Deadlift', muscleGroup: 'back' },
  { id: 'pull-up', name: 'Pull-Up', muscleGroup: 'back' },
  { id: 'barbell-row', name: 'Barbell Row', muscleGroup: 'back' },
  { id: 'lat-pulldown', name: 'Lat Pulldown', muscleGroup: 'back' },
  { id: 'seated-cable-row', name: 'Seated Cable Row', muscleGroup: 'back' },

  // Legs
  { id: 'squat', name: 'Squat', muscleGroup: 'legs' },
  { id: 'leg-press', name: 'Leg Press', muscleGroup: 'legs' },
  { id: 'romanian-deadlift', name: 'Romanian Deadlift', muscleGroup: 'legs' },
  { id: 'leg-extension', name: 'Leg Extension', muscleGroup: 'legs' },
  { id: 'leg-curl', name: 'Leg Curl', muscleGroup: 'legs' },
  { id: 'calf-raise', name: 'Calf Raise', muscleGroup: 'legs' },

  // Shoulders
  { id: 'overhead-press', name: 'Overhead Press', muscleGroup: 'shoulders' },
  { id: 'lateral-raise', name: 'Lateral Raise', muscleGroup: 'shoulders' },
  { id: 'front-raise', name: 'Front Raise', muscleGroup: 'shoulders' },
  { id: 'rear-delt-fly', name: 'Rear Delt Fly', muscleGroup: 'shoulders' },
  { id: 'shrug', name: 'Shrug', muscleGroup: 'shoulders' },

  // Biceps
  { id: 'barbell-curl', name: 'Barbell Curl', muscleGroup: 'biceps' },
  { id: 'db-curl', name: 'Dumbbell Curl', muscleGroup: 'biceps' },
  { id: 'hammer-curl', name: 'Hammer Curl', muscleGroup: 'biceps' },
  { id: 'preacher-curl', name: 'Preacher Curl', muscleGroup: 'biceps' },

  // Triceps
  { id: 'triceps-pushdown', name: 'Triceps Pushdown', muscleGroup: 'triceps' },
  { id: 'skull-crusher', name: 'Skull Crusher', muscleGroup: 'triceps' },
  { id: 'close-grip-bench', name: 'Close-Grip Bench Press', muscleGroup: 'triceps' },
  { id: 'triceps-dip', name: 'Triceps Dip', muscleGroup: 'triceps' },

  // Core
  { id: 'plank', name: 'Plank', muscleGroup: 'core' },
  { id: 'hanging-leg-raise', name: 'Hanging Leg Raise', muscleGroup: 'core' },
  { id: 'cable-crunch', name: 'Cable Crunch', muscleGroup: 'core' },
  { id: 'russian-twist', name: 'Russian Twist', muscleGroup: 'core' },
];

export function exercisesByGroup(groupId) {
  return EXERCISES.filter((exercise) => exercise.muscleGroup === groupId);
}

export function getExercise(id) {
  return EXERCISES.find((exercise) => exercise.id === id);
}

export function getMuscleGroup(id) {
  return MUSCLE_GROUPS.find((group) => group.id === id);
}
