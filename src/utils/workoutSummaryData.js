import { isBodyweightExercise } from '../data/exercises';
import { workoutVolume } from './workoutStats';

// One shape for the end-of-workout card, from any workout object.
//
// The card (components/workout/AnimatedWorkoutSummary.jsx) is fed from two
// very different places: the finish flow, which has the server's fresh
// return (duration, volume, records) in hand, and History, which has the
// stored users/{uid}/workouts document. This is the adapter between them,
// so the card itself never has to know which one it is looking at — and
// so a replay of last Tuesday's session plays exactly the animation the
// finish did, off the same numbers.
//
// READ-ONLY, BY CONSTRUCTION. This takes a plain object and returns a
// plain object. It calls no function, touches no store and writes
// nothing, which is the guarantee that replaying a workout can never pay
// it out a second time: nothing on the replay path is capable of it.
//
// Fields it looks for, in order of preference:
//
//   exercises[].sets[]   completed sets only (a stored set is always
//                        completed; an active workout's carry the flag)
//   durationMs           or finishedAt − startedAt (the stored pair)
//   totalVolumeKg        the server's figure, else re-summed client-side
//   personalRecords      or unpublishedRecords (the stored doc's copy of
//                        the same server list — never cleared, only read,
//                        see functions/publishRecords.js)
//   coinsEarned          as stored
//   coinBoosts           or the `coinBoost` marker on each exercise
//   finishedAt           as stored
export function summaryFromWorkout(workout) {
  const w = workout && typeof workout === 'object' ? workout : {};
  const exercises = (Array.isArray(w.exercises) ? w.exercises : [])
    .map((exercise) => {
      const exerciseBodyweight = exercise?.isBodyweight === true || isBodyweightExercise(exercise?.exerciseId);
      const sets = (Array.isArray(exercise?.sets) ? exercise.sets : [])
        .filter((set) => set && set.completed !== false)
        .map((set) => {
          const isBodyweight = set.isBodyweight === true || exerciseBodyweight;
          return {
            reps: Number(set.reps) || 0,
            weight: Number(set.weight) || 0,
            isBodyweight,
            addedWeight: isBodyweight ? Number(set.addedWeight) || 0 : 0,
          };
        });
      return { name: exercise?.name ?? exercise?.exerciseId ?? '', sets };
    })
    .filter((exercise) => exercise.sets.length > 0);

  let durationMs = Number(w.durationMs);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    const started = Date.parse(w.startedAt);
    const finished = Date.parse(w.finishedAt);
    durationMs = Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, finished - started) : 0;
  }

  const storedVolume = Number(w.totalVolumeKg);
  const totalVolumeKg =
    Number.isFinite(storedVolume) && storedVolume > 0
      ? storedVolume
      : Array.isArray(w.exercises)
        ? workoutVolume({ exercises: w.exercises })
        : 0;

  const records = Array.isArray(w.personalRecords)
    ? w.personalRecords
    : Array.isArray(w.unpublishedRecords)
      ? w.unpublishedRecords
      : [];
  const personalRecords = records.filter((r) => r && typeof r.name === 'string');

  const coinBoosts = Array.isArray(w.coinBoosts)
    ? w.coinBoosts
    : (Array.isArray(w.exercises) ? w.exercises : [])
        .filter((e) => Number(e?.coinBoost) > 1)
        .map((e) => ({ exerciseId: e.exerciseId, name: e.name, multiplier: Number(e.coinBoost) }));

  return {
    exercises,
    durationMs,
    totalVolumeKg,
    personalRecords,
    coinsEarned: Math.max(0, Number(w.coinsEarned) || 0),
    coinBoosts,
    finishedAt: Date.parse(w.finishedAt) ? w.finishedAt : null,
  };
}
