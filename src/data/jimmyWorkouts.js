// Jimmy's Workouts — the pre-built programs behind the "Jimmy's Workouts"
// option in the Start Workout sheet (components/workout/StartWorkoutSheet).
//
// Five established splits, each a handful of named sessions, each session
// a list of catalog exercises with a prescribed sets × reps. Everything
// here references data/exercises.js by id, never by name, so a session
// carries the same equipment, muscle-group and bodyweight facts the
// logger needs for any other exercise; tools/jimmyWorkouts.test.mjs
// refuses an id the catalog does not know.
//
// What "starting one" means (App.jsx's handleStartProgram): the same
// start as a saved template — the exercises in order, sets seeded from
// the lifter's own last performance of each — except the PRESCRIBED reps
// win over history, since the point of a program is the scheme. It is
// not the user's routine, so no templateId is set and the finish flow
// still offers to save it as one under the session's name.
//
// Hand-written, deliberately: this is the one place in the app where the
// content is the feature, and a table that reads as a coach's whiteboard
// is worth more than a generator.

import { getExercise } from './exercises.js';

// One line of the whiteboard: catalog id, sets, reps. Resolved against
// the catalog at read time (see programWorkoutTemplate) so a renamed
// exercise renames here too.
const ex = (exerciseId, sets, reps) => ({ exerciseId, sets, reps });

export const JIMMY_SPLITS = [
  {
    id: 'ppl',
    name: 'Push / Pull / Legs',
    short: 'PPL',
    icon: '🔥',
    tagline: 'The classic three-way split. Run it once a week or twice.',
    daysPerWeek: '3–6 days',
    workouts: [
      {
        id: 'push',
        name: 'Push Day',
        focus: 'Chest · Shoulders · Triceps',
        exercises: [
          ex('bench-press', 4, 8),
          ex('overhead-press', 3, 8),
          ex('incline-db-press', 3, 10),
          ex('lateral-raise', 3, 12),
          ex('triceps-pushdown', 3, 12),
          ex('overhead-db-extension', 3, 12),
        ],
      },
      {
        id: 'pull',
        name: 'Pull Day',
        focus: 'Back · Biceps · Rear delts',
        exercises: [
          ex('deadlift', 3, 5),
          ex('lat-pulldown', 3, 10),
          ex('barbell-row', 3, 8),
          ex('face-pull', 3, 15),
          ex('db-curl', 3, 12),
          ex('hammer-curl', 3, 12),
        ],
      },
      {
        id: 'legs',
        name: 'Leg Day',
        focus: 'Quads · Hamstrings · Glutes · Calves',
        exercises: [
          ex('squat', 4, 6),
          ex('romanian-deadlift', 3, 8),
          ex('leg-press', 3, 12),
          ex('leg-curl', 3, 12),
          ex('calf-raise', 4, 15),
          ex('hanging-leg-raise', 3, 12),
        ],
      },
    ],
  },
  {
    id: 'upper-lower',
    name: 'Upper / Lower',
    short: 'U/L',
    icon: '⚖️',
    tagline: 'Four days a week, every muscle twice. Strength days, then volume days.',
    daysPerWeek: '4 days',
    workouts: [
      {
        id: 'upper-a',
        name: 'Upper A',
        focus: 'Strength · Chest & Back first',
        exercises: [
          ex('bench-press', 4, 6),
          ex('barbell-row', 4, 6),
          ex('overhead-press', 3, 8),
          ex('lat-pulldown', 3, 10),
          ex('barbell-curl', 3, 10),
          ex('triceps-pushdown', 3, 10),
        ],
      },
      {
        id: 'lower-a',
        name: 'Lower A',
        focus: 'Strength · Squat-led',
        exercises: [
          ex('squat', 4, 6),
          ex('romanian-deadlift', 3, 8),
          ex('leg-press', 3, 10),
          ex('leg-curl', 3, 10),
          ex('calf-raise', 4, 12),
          ex('ab-wheel', 3, 10),
        ],
      },
      {
        id: 'upper-b',
        name: 'Upper B',
        focus: 'Volume · Dumbbells & cables',
        exercises: [
          ex('incline-db-press', 3, 10),
          ex('seated-cable-row', 3, 12),
          ex('arnold-press', 3, 10),
          ex('chest-fly', 3, 12),
          ex('face-pull', 3, 15),
          ex('hammer-curl', 3, 12),
        ],
      },
      {
        id: 'lower-b',
        name: 'Lower B',
        focus: 'Volume · Hinge-led',
        exercises: [
          ex('deadlift', 3, 5),
          ex('bulgarian-split-squat', 3, 10),
          ex('leg-extension', 3, 15),
          ex('hip-thrust', 3, 12),
          ex('calf-raise', 3, 15),
          ex('hanging-leg-raise', 3, 12),
        ],
      },
    ],
  },
  {
    id: 'arnold',
    name: 'Arnold Split',
    short: 'Arnold',
    icon: '🏆',
    tagline: "Chest with back, shoulders with arms, legs on their own. The Oak's own week.",
    daysPerWeek: '3–6 days',
    workouts: [
      {
        id: 'chest-back',
        name: 'Chest & Back',
        focus: 'Antagonist pairs, big pumps',
        exercises: [
          ex('bench-press', 4, 8),
          ex('barbell-row', 4, 8),
          ex('incline-db-press', 3, 10),
          ex('pull-up', 3, 8),
          ex('chest-fly', 3, 12),
          ex('seated-cable-row', 3, 12),
        ],
      },
      {
        id: 'shoulders-arms',
        name: 'Shoulders & Arms',
        focus: 'Delts, then biceps and triceps back to back',
        exercises: [
          ex('overhead-press', 4, 8),
          ex('lateral-raise', 4, 12),
          ex('rear-delt-fly', 3, 15),
          ex('barbell-curl', 3, 10),
          ex('skull-crusher', 3, 10),
          ex('hammer-curl', 3, 12),
          ex('triceps-pushdown', 3, 12),
        ],
      },
      {
        id: 'legs',
        name: 'Legs',
        focus: 'Quads · Hamstrings · Calves',
        exercises: [
          ex('squat', 4, 8),
          ex('romanian-deadlift', 3, 10),
          ex('leg-press', 3, 12),
          ex('leg-extension', 3, 15),
          ex('leg-curl', 3, 12),
          ex('calf-raise', 4, 15),
        ],
      },
    ],
  },
  {
    id: 'full-body',
    name: 'Full Body',
    short: 'Full Body',
    icon: '💪',
    tagline: 'Three sessions a week, everything every time. The best split for a busy week.',
    daysPerWeek: '3 days',
    workouts: [
      {
        id: 'a',
        name: 'Full Body A',
        focus: 'Squat · Bench · Row',
        exercises: [
          ex('squat', 3, 8),
          ex('bench-press', 3, 8),
          ex('barbell-row', 3, 8),
          ex('overhead-press', 2, 10),
          ex('db-curl', 2, 12),
          ex('hanging-leg-raise', 2, 12),
        ],
      },
      {
        id: 'b',
        name: 'Full Body B',
        focus: 'Deadlift · Press · Pulldown',
        exercises: [
          ex('deadlift', 3, 5),
          ex('incline-db-press', 3, 10),
          ex('lat-pulldown', 3, 10),
          ex('leg-press', 3, 12),
          ex('lateral-raise', 2, 15),
          ex('triceps-pushdown', 2, 12),
        ],
      },
      {
        id: 'c',
        name: 'Full Body C',
        focus: 'Dumbbells & cables, lighter day',
        exercises: [
          ex('goblet-squat', 3, 12),
          ex('push-up', 3, 12),
          ex('seated-cable-row', 3, 12),
          ex('romanian-deadlift', 3, 10),
          ex('arnold-press', 3, 10),
          ex('ab-wheel', 3, 10),
        ],
      },
    ],
  },
  {
    id: 'gena-sculpt',
    name: "Gena's Sculpt",
    short: 'Sculpt',
    subtitle: 'Glutes & Core',
    icon: '✨',
    // Drawn with Gena's head on the split card — it is her program.
    mascot: 'gena',
    tagline: 'Glute-led lower days, a sculpting upper day and a core finisher.',
    daysPerWeek: '3–4 days',
    workouts: [
      {
        id: 'glute-builder',
        name: 'Glute Builder',
        focus: 'Hip thrust first, hamstrings after',
        exercises: [
          ex('hip-thrust', 4, 10),
          ex('romanian-deadlift', 3, 10),
          ex('bulgarian-split-squat', 3, 12),
          ex('glute-bridge', 3, 15),
          ex('leg-curl', 3, 12),
          ex('calf-raise', 3, 15),
        ],
      },
      {
        id: 'sculpt-upper',
        name: 'Sculpt Upper',
        focus: 'Back · Shoulders · Arms, higher reps',
        exercises: [
          ex('lat-pulldown', 3, 12),
          ex('incline-db-press', 3, 12),
          ex('seated-cable-row', 3, 12),
          ex('lateral-raise', 3, 15),
          ex('face-pull', 3, 15),
          ex('triceps-pushdown', 3, 12),
        ],
      },
      {
        id: 'lower-burn',
        name: 'Lower Burn',
        focus: 'Quads & glutes, short rests',
        exercises: [
          ex('goblet-squat', 3, 15),
          ex('leg-press', 3, 15),
          ex('hip-thrust', 3, 12),
          ex('leg-extension', 3, 15),
          ex('calf-raise', 3, 20),
        ],
      },
      {
        id: 'core',
        name: 'Core Finisher',
        focus: 'Abs · Obliques · Glute bridge burnout',
        exercises: [
          ex('cable-crunch', 3, 15),
          ex('hanging-leg-raise', 3, 12),
          ex('russian-twist', 3, 20),
          ex('ab-wheel', 3, 10),
          ex('glute-bridge', 3, 20),
        ],
      },
    ],
  },
];

export function getJimmySplit(splitId) {
  return JIMMY_SPLITS.find((split) => split.id === splitId) ?? null;
}

// The id a started program carries on the active workout (`programId`):
// "jimmy:<split>:<workout>". Never sent to the server.
export function programId(split, workout) {
  return `jimmy:${split.id}:${workout.id}`;
}

// The session as the start path takes it: the same { exerciseId, name,
// muscleGroup } rows a saved template has, plus each row's prescribed
// sets and reps. Resolved against the catalog here so the data above
// stays ids-only; a row whose id the catalog has lost is dropped rather
// than started as a nameless exercise (the test above makes that a
// build-time failure, not a runtime one).
export function programWorkoutTemplate(split, workout) {
  const exercises = workout.exercises
    .map((row) => {
      const exercise = getExercise(row.exerciseId);
      if (!exercise) return null;
      return {
        exerciseId: exercise.id,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        sets: row.sets,
        reps: row.reps,
      };
    })
    .filter(Boolean);
  return {
    id: programId(split, workout),
    title: workout.name,
    splitName: split.name,
    focus: workout.focus,
    exercises,
  };
}

// "6 exercises · 19 sets" for a session row.
export function programWorkoutSummary(workout) {
  const sets = workout.exercises.reduce((sum, row) => sum + row.sets, 0);
  const n = workout.exercises.length;
  return `${n} exercise${n === 1 ? '' : 's'} · ${sets} sets`;
}
