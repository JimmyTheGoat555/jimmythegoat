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

// Summed here rather than trusted from anywhere else: this is the ONLY
// server-computed lifetime total (used to publish an evolution stage to
// friends — see publicProfile.js), and it has to agree with what the owner
// sees in their own app, which derives the same number the same way
// (utils/workoutStats.js's lifetimeVolume) from the same per-set data.
function lifetimeVolumeOf(workouts) {
  let total = 0;
  for (const workout of workouts ?? []) {
    for (const exercise of workout?.exercises ?? []) {
      for (const set of exercise?.sets ?? []) {
        if (set.completed === false) continue;
        const weight = Number(set.weight);
        const reps = Number(set.reps);
        if (Number.isFinite(weight) && Number.isFinite(reps)) total += weight * reps;
      }
    }
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
