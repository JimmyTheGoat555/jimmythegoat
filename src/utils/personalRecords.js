// "Heaviest weight ever lifted on this exercise" — the plain-language
// definition of a PR, and the one the celebration has to be able to explain
// in a sentence on someone's feed.
//
// Deliberately NOT estimated 1RM (weight x reps), which is the more
// training-accurate measure but produces posts like "new record: 102.3 kg
// estimated" that nobody can verify against what they actually lifted.
// Reps are carried along for context ("100 kg x 5") but never decide
// whether something counts.
//
// This runs client-side only to decide whether to ASK about sharing. The
// server recomputes it from the real history before anything is published —
// see functions/records.js — so a tampered client can't manufacture a PR on
// a friend's feed.

function bestSetOf(exercise) {
  let best = null;
  for (const set of exercise?.sets ?? []) {
    // An un-ticked set is something typed but not actually performed.
    if (set.completed === false) continue;
    const weight = Number(set.weight);
    const reps = Number(set.reps);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    if (!Number.isFinite(reps) || reps <= 0) continue;
    if (!best || weight > best.weight) best = { weight, reps };
  }
  return best;
}

// exerciseId -> heaviest completed set ever recorded for it.
export function bestWeightPerExercise(workouts) {
  const best = new Map();
  for (const workout of workouts ?? []) {
    // Recovery workouts (see functions/economy.js) are un-rewarded — they
    // can't set a PR and don't raise the bar for later ones. Matches the
    // server's records.js so the client's "share this PR?" prompt only
    // ever offers a record the server would actually publish.
    if (workout?.recoveryWorkout) continue;
    for (const exercise of workout?.exercises ?? []) {
      const top = bestSetOf(exercise);
      if (!top || !exercise.exerciseId) continue;
      const current = best.get(exercise.exerciseId);
      if (!current || top.weight > current.weight) best.set(exercise.exerciseId, top);
    }
  }
  return best;
}

// PRs set by `currentExercises`, measured against everything logged before.
// `pastWorkouts` must not include the workout being finished.
export function findNewPersonalRecords(currentExercises, pastWorkouts) {
  const best = bestWeightPerExercise(pastWorkouts);
  const records = [];
  for (const exercise of currentExercises ?? []) {
    const top = bestSetOf(exercise);
    if (!top || !exercise.exerciseId) continue;
    const previous = best.get(exercise.exerciseId);
    // A previous best is required. The first time you ever log an exercise
    // is technically your heaviest ever, but "PR: 5 kg bicep curl, first
    // attempt" is not an achievement, and broadcasting it to friends makes
    // the whole feature read as noise.
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
