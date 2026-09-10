// Pure calculations over the workout history. Kept UI-free so they're easy
// to unit test and reuse between the Dashboard and Progress views.

import { MUSCLE_GROUPS } from '../data/exercises';

// Evidence-based hypertrophy range: most lifters make the best progress
// landing 12-18 effective (completed) sets per muscle group per week.
export const OPTIMAL_WEEKLY_SETS_MIN = 12;
export const OPTIMAL_WEEKLY_SETS_MAX = 18;

export function setVolume(set) {
  const weight = Number(set.weight) || 0;
  const reps = Number(set.reps) || 0;
  return weight * reps;
}

export function workoutVolume(workout) {
  return workout.exercises.reduce(
    (total, exercise) =>
      total + exercise.sets.filter((s) => s.completed).reduce((sum, s) => sum + setVolume(s), 0),
    0,
  );
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

// Total kilograms ever lifted across every finished workout — the number
// behind the LifetimeVolumeCard's "idle game" tonnage display.
export function lifetimeVolume(workouts) {
  return workouts.filter((w) => w.finishedAt).reduce((sum, w) => sum + workoutVolume(w), 0);
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
