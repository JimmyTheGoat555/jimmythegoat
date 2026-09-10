// "What did I do last time on this exercise?" — the single most-asked
// question mid-set, and until now the app had no answer that didn't mean
// leaving the logger for the History tab. ExerciseLogCard shows the result
// as a compact line ("Last time · 80×8 · 80×7 · 75×8") right under the
// exercise name.
//
// `workouts` is the cloud history list (useCloudWorkoutHistory), already
// sorted finishedAt-desc, so the first workout containing this exercise as
// we walk forward IS the most recent one. The workout in progress is never
// in that list yet, so "last time" can never accidentally echo the set
// just typed.

function tidySets(exercise) {
  return (exercise?.sets ?? [])
    .filter((s) => s.completed !== false)
    .map((s) => ({ weight: Number(s.weight), reps: Number(s.reps) }))
    // weight >= 0 (not > 0): a bodyweight movement legitimately logs 0 kg.
    // reps > 0 drops the blank "typed but never filled in" rows.
    .filter((s) => Number.isFinite(s.weight) && s.weight >= 0 && Number.isFinite(s.reps) && s.reps > 0);
}

export function lastPerformance(exerciseId, workouts) {
  if (!exerciseId) return null;
  for (const workout of workouts ?? []) {
    const match = workout?.exercises?.find((e) => e.exerciseId === exerciseId);
    if (!match) continue;
    const sets = tidySets(match);
    if (sets.length === 0) continue;
    return { finishedAt: workout.finishedAt ?? null, sets };
  }
  return null;
}

// "80×8 · 80×8 · 75×8" — kg is implied (the whole app is kg) and left off
// each entry so five sets still fit one line.
export function formatSets(sets) {
  return (sets ?? []).map((s) => `${s.weight}×${s.reps}`).join(' · ');
}
