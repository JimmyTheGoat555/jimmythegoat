// Pure calculations over the workout history. Kept UI-free so they're easy
// to unit test and reuse between the Dashboard and Progress views.

import { MUSCLE_GROUPS } from '../data/exercises';
import { absoluteSetWeight } from './setLoad';

// Evidence-based hypertrophy range: most lifters make the best progress
// landing 12-18 effective (completed) sets per muscle group per week.
export const OPTIMAL_WEEKLY_SETS_MIN = 12;
export const OPTIMAL_WEEKLY_SETS_MAX = 18;

// `effectiveWeightKg` overrides the stored `set.weight` — used for an
// in-progress bodyweight set, whose weight is still blank on the client
// (logWorkout folds in the lifter's body weight server-side). A finished
// workout's bodyweight sets already store their computed weight, so they
// need no override.
//
// Note what this does NOT do: multiply anything for dumbbells. That would
// be the obvious place to put "both hands count", and it is the wrong
// one — `set.weight` is already the absolute load for every set the new
// input sheet writes (a 25 kg dumbbell in each hand stores 50), so
// doubling here would count it twice. The per-hand figure lives beside it
// in `perHandWeight`, for display and for re-opening the input. The whole
// contract is written out in utils/setLoad.js.
export function setVolume(set, effectiveWeightKg) {
  const weight = effectiveWeightKg != null ? Number(effectiveWeightKg) : absoluteSetWeight(set);
  const reps = Number(set.reps) || 0;
  return weight * reps;
}

export function workoutVolume(workout, bodyWeightKg = 0) {
  return workout.exercises.reduce((total, exercise) => {
    const bw = exercise.isBodyweight === true;
    return (
      total +
      exercise.sets
        .filter((s) => s.completed)
        .reduce((sum, s) => {
          const inProgressBw = bw && !(Number(s.weight) > 0);
          const eff = inProgressBw ? (Number(bodyWeightKg) || 0) + (Number(s.addedWeight) || 0) : undefined;
          return sum + setVolume(s, eff);
        }, 0)
    );
  }, 0);
}

export function workoutSetCount(workout) {
  return workout.exercises.reduce(
    (total, exercise) => total + exercise.sets.filter((s) => s.completed).length,
    0,
  );
}

// Exported so other modules (challenge resolution, leaderboard week math)
// share the exact same week-boundary definition instead of redefining it.
export function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

// Total volume for an arbitrary 7-day week starting at `weekStart` (a Date
// or ISO string). Used to score a 1-on-1 Challenge for a specific week,
// as opposed to weeklySummary() which is always "this week vs last week".
export function volumeForWeek(workouts, weekStart) {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  return workouts
    .filter((w) => w.finishedAt && new Date(w.finishedAt) >= start && new Date(w.finishedAt) < end)
    .reduce((sum, w) => sum + workoutVolume(w), 0);
}

export function weeklySummary(workouts) {
  const now = new Date();
  const thisWeekStart = startOfWeek(now);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const finished = workouts.filter((w) => w.finishedAt);

  const thisWeek = finished.filter((w) => new Date(w.finishedAt) >= thisWeekStart);
  const lastWeek = finished.filter(
    (w) => new Date(w.finishedAt) >= lastWeekStart && new Date(w.finishedAt) < thisWeekStart,
  );

  const thisWeekVolume = thisWeek.reduce((sum, w) => sum + workoutVolume(w), 0);
  const lastWeekVolume = lastWeek.reduce((sum, w) => sum + workoutVolume(w), 0);

  const volumeDeltaPct =
    lastWeekVolume === 0
      ? thisWeekVolume > 0
        ? 100
        : 0
      : Math.round(((thisWeekVolume - lastWeekVolume) / lastWeekVolume) * 100);

  return {
    workoutCount: thisWeek.length,
    totalSets: thisWeek.reduce((sum, w) => sum + workoutSetCount(w), 0),
    totalVolume: thisWeekVolume,
    volumeDeltaPct,
  };
}

// Per-exercise progress across all finished workouts: best set (top weight)
// and total volume for each session that included the exercise.
export function exerciseProgress(workouts, exerciseId) {
  return workouts
    .filter((w) => w.finishedAt)
    .map((workout) => {
      const entry = workout.exercises.find((e) => e.exerciseId === exerciseId);
      if (!entry) return null;
      const completedSets = entry.sets.filter((s) => s.completed);
      if (completedSets.length === 0) return null;
      const topWeight = Math.max(...completedSets.map((s) => Number(s.weight) || 0));
      const volume = completedSets.reduce((sum, s) => sum + setVolume(s), 0);
      return {
        date: workout.finishedAt,
        topWeight,
        volume,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Divisor for workouts logged BEFORE relative scoring existed (no stored
// `score` / per-set `relativeVolume`) — kept in sync with
// functions/storeCatalog.js's LEGACY_BODYWEIGHT_KG so the owner's number
// matches the server-published one.
const LEGACY_BODYWEIGHT_KG = 75;

// Relative Strength Volume for one workout: the stored `score` if it has
// one (new workouts), else the sum of per-set `relativeVolume`, else raw
// kg mapped onto the new scale against an average lifter (legacy).
//
// Mirrors functions/records.js's workoutRelativeScore: a workout only
// counts toward the tier if it carries `verified: true` or a numeric
// `score` — both server-stamped and un-writable by a client. A directly
// edited "history correction" (allowed by firestore.rules for fixing a
// typo) contributes 0, so it can't inflate the displayed tier either.
export function workoutScore(workout) {
  if (workout.verified !== true && typeof workout.score !== 'number') return 0;
  if (typeof workout.score === 'number' && Number.isFinite(workout.score)) return workout.score;
  let relative = 0;
  let legacy = 0;
  let sawRelative = false;
  for (const exercise of workout.exercises ?? []) {
    for (const s of exercise.sets ?? []) {
      if (!s.completed) continue;
      const reps = Number(s.reps) || 0;
      const weight = Number(s.weight) || 0;
      if (Number.isFinite(Number(s.relativeVolume))) {
        sawRelative = true;
        relative += Number(s.relativeVolume);
      }
      legacy += (weight / LEGACY_BODYWEIGHT_KG) * reps;
    }
  }
  return sawRelative ? relative : legacy;
}

// Cumulative Relative Strength Volume across every finished workout — the
// number behind the evolution tier AND the "strength score" card.
// Recovery workouts (logged after a long layoff — see functions/economy.js)
// are excluded; the server's lifetimeVolumeOf in functions/records.js
// applies the same filter so the two numbers agree.
export function lifetimeVolume(workouts) {
  return workouts
    .filter((w) => w.finishedAt && !w.recoveryWorkout)
    .reduce((sum, w) => sum + workoutScore(w), 0);
}

// This week's cumulative Relative Strength Volume — the number the weekly
// leaderboard ranks on now (its strength-relative counterpart to
// weeklySummary().totalVolume, which stays raw kg for the "tonnage this
// week" displays). Recovery workouts earn nothing, so they're excluded
// here exactly as in lifetimeVolume(). Same week boundary as
// weeklySummary via startOfWeek().
export function weeklyScore(workouts) {
  const weekStart = startOfWeek(new Date());
  return (workouts ?? [])
    .filter((w) => w.finishedAt && !w.recoveryWorkout && new Date(w.finishedAt) >= weekStart)
    .reduce((sum, w) => sum + workoutScore(w), 0);
}

// ISO timestamp of the most recent finished workout, or null if there are
// none. Recovery workouts ARE counted here — the whole point of one is to
// refresh this clock and lift the neglect penalty (see
// utils/evolutionTiers.js's isTierNeglected). ISO strings sort
// lexicographically in timestamp order, so a plain string compare is safe.
export function lastWorkoutAt(workouts) {
  let latest = null;
  for (const w of workouts ?? []) {
    if (!w.finishedAt) continue;
    if (latest === null || w.finishedAt > latest) latest = w.finishedAt;
  }
  return latest;
}

// Completed sets per muscle group so far this week — the basis for the
// per-group hypertrophy-range progress bars on the Dashboard. Every muscle
// group is included even at 0 sets, so the gaps are visible too.
export function weeklySetsByMuscleGroup(workouts) {
  const thisWeekStart = startOfWeek(new Date());
  const finishedThisWeek = workouts.filter(
    (w) => w.finishedAt && new Date(w.finishedAt) >= thisWeekStart,
  );

  const setsByGroup = {};
  finishedThisWeek.forEach((workout) => {
    workout.exercises.forEach((exercise) => {
      const completed = exercise.sets.filter((s) => s.completed).length;
      setsByGroup[exercise.muscleGroup] = (setsByGroup[exercise.muscleGroup] || 0) + completed;
    });
  });

  return MUSCLE_GROUPS.map((group) => ({
    ...group,
    sets: setsByGroup[group.id] || 0,
  }));
}

// True once the 7-day window starting at `weekStart` has fully elapsed —
// used to gate resolving a weekly Challenge.
export function isWeekOver(weekStart) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  return new Date() >= end;
}

export function exercisesTrainedInHistory(workouts) {
  const ids = new Set();
  workouts
    .filter((w) => w.finishedAt)
    .forEach((w) => w.exercises.forEach((e) => ids.add(e.exerciseId)));
  return Array.from(ids);
}
