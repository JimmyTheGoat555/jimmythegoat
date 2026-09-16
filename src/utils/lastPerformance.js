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
    .map((s) => ({
      weight: Number(s.weight),
      reps: Number(s.reps),
      // Carried through for auto-fill (see seedSetsFromHistory). For a
      // bodyweight movement the stored `weight` is the EFFECTIVE load the
      // server computed — body weight plus belt — so it's the right number
      // for the "Last time · 82×8" line but completely the wrong one to
      // put back in the belt field. `addedWeight` is the only part that
      // was actually the lifter's choice, so that's what gets re-seeded.
      addedWeight: Number(s.addedWeight) || 0,
      // The input sheet's own context, carried through so repeating last
      // week's session re-opens with the same bar and the same plates
      // rather than back-solving them from the total. Copied verbatim,
      // including `isPerHand`, which is the marker that says whether
      // `weight` above is one dumbbell or the pair — see utils/setLoad.js.
      ...(s.barWeight !== undefined ? { barWeight: Number(s.barWeight) } : {}),
      ...(s.weightPerSide !== undefined ? { weightPerSide: Number(s.weightPerSide) } : {}),
      ...(s.isPerHand === true ? { isPerHand: true, perHandWeight: Number(s.perHandWeight) } : {}),
    }))
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

// Builds the starting sets for an exercise being added to a workout,
// pre-filled from the last time it was performed so someone repeating the
// same weights types nothing at all.
//
// Position-matched, not summarised: set 1 gets last session's set 1, set 2
// gets set 2, and so on. That preserves a descending or ramping scheme
// (80×8, 80×7, 75×8) instead of flattening it to one number, which is the
// whole reason this is worth doing.
//
// Counts differ gracefully in both directions — 4 sets last time fills the
// 3 slots and drops the rest; 2 sets last time fills two and leaves the
// third blank to grow into. No history means blanks, exactly as before.
//
// `completed` is ALWAYS false. These are a suggestion, not a claim that
// the work happened: the lifter still checks each set off to earn its
// volume, which is the only thing that makes the numbers mean anything.
export function seedSetsFromHistory(last, { count, isBodyweight = false } = {}) {
  return Array.from({ length: count }, (_, i) => {
    const historical = last?.sets?.[i];
    const base = { id: crypto.randomUUID(), weight: '', reps: '', completed: false };
    if (!historical) return base;
    return isBodyweight
      ? // The load is the lifter's body weight (folded in server-side), so
        // only the belt and the reps are theirs to repeat.
        { ...base, addedWeight: historical.addedWeight, reps: historical.reps }
      : {
          ...base,
          weight: historical.weight,
          reps: historical.reps,
          ...(historical.barWeight !== undefined ? { barWeight: historical.barWeight } : {}),
          ...(historical.weightPerSide !== undefined ? { weightPerSide: historical.weightPerSide } : {}),
          ...(historical.isPerHand === true
            ? { isPerHand: true, perHandWeight: historical.perHandWeight }
            : {}),
        };
  });
}
