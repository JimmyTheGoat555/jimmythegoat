// Server-side personal-record detection.
//
// Deliberately a duplicate of src/utils/personalRecords.js rather than a
// shared module — same reason headline() is duplicated in economy.js: the
// app is ESM and functions/ is CommonJS, and wiring a build step for ~40
// lines costs more than it saves. The two must agree; if you change the
// definition of a PR, change both.
//
// The client copy only decides whether to ASK about sharing. This copy is
// what actually gets published, recomputed from stored history, so a client
// cannot claim a record it did not set.

const { LEGACY_BODYWEIGHT_KG } = require('./storeCatalog');

function bestSetOf(exercise) {
  let best = null;
  for (const set of exercise?.sets ?? []) {
    if (set.completed === false) continue;
    const weight = Number(set.weight);
    const reps = Number(set.reps);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    if (!Number.isFinite(reps) || reps <= 0) continue;
    if (!best || weight > best.weight) best = { weight, reps };
  }
  return best;
}

function bestWeightPerExercise(workouts) {
  const best = new Map();
  for (const workout of workouts ?? []) {
    // A recovery workout (logged after >= NEGLECT_RECOVERY_DAYS away — see
    // economy.js) is un-rewarded: it can't set a record and its lifts
    // don't raise the bar for future ones either.
    if (workout?.recoveryWorkout) continue;
    for (const exercise of workout?.exercises ?? []) {
      const top = bestSetOf(exercise);
      if (!top || !exercise.exerciseId) continue;
      const current = best.get(exercise.exerciseId);
      // `name` rides along here only for publicProfile.js's benefit (the
      // full all-time-best list shown on a friend's profile needs a label
      // per exercise) — findNewPersonalRecords below never reads it off
      // this map, it only compares .weight, so adding the field doesn't
      // touch the actual PR definition.
      if (!current || top.weight > current.weight) {
        best.set(exercise.exerciseId, { ...top, name: exercise.name ?? exercise.exerciseId });
      }
    }
  }
  return best;
}

// Relative Strength Volume for one workout. Prefers the stored `score`
// (new workouts), falls back to summing per-set `relativeVolume` (an
// edited new workout), and last-resorts to mapping raw kg onto the new
// scale against an average lifter (workouts logged before relative
// scoring existed).
function workoutRelativeScore(workout) {
  if (typeof workout?.score === 'number' && Number.isFinite(workout.score)) return workout.score;
  let total = 0;
  let sawRelative = false;
  let legacy = 0;
  for (const exercise of workout?.exercises ?? []) {
    for (const set of exercise?.sets ?? []) {
      if (set.completed === false) continue;
      const reps = Number(set.reps);
      const weight = Number(set.weight);
      if (!Number.isFinite(reps) || !Number.isFinite(weight)) continue;
      if (Number.isFinite(Number(set.relativeVolume))) {
        sawRelative = true;
        total += Number(set.relativeVolume);
      }
      legacy += (weight / LEGACY_BODYWEIGHT_KG) * reps;
    }
  }
  return sawRelative ? total : legacy;
}

// The ONLY server-computed lifetime total (published to friends — see
// publicProfile.js). Must agree with the owner's own app, which derives
// the same number the same way (utils/workoutStats.js's lifetimeVolume).
// This is now the cumulative Relative Strength Volume, not raw kg.
function lifetimeVolumeOf(workouts) {
  let total = 0;
  for (const workout of workouts ?? []) {
    // Recovery workouts refresh the training clock but never count toward
    // the lifetime total — see economy.js and src/utils/workoutStats.js.
    if (workout?.recoveryWorkout) continue;
    total += workoutRelativeScore(workout);
  }
  return total;
}

function findNewPersonalRecords(currentExercises, pastWorkouts) {
  const best = bestWeightPerExercise(pastWorkouts);
  const records = [];
  for (const exercise of currentExercises ?? []) {
    const top = bestSetOf(exercise);
    if (!top || !exercise.exerciseId) continue;
    const previous = best.get(exercise.exerciseId);
    if (!previous || top.weight <= previous.weight) continue;
    records.push({
      exerciseId: exercise.exerciseId,
      name: exercise.name ?? exercise.exerciseId,
      weight: top.weight,
      reps: top.reps,
      previousWeight: previous.weight,
    });
  }
  return records;
}

module.exports = { bestWeightPerExercise, findNewPersonalRecords, lifetimeVolumeOf };
