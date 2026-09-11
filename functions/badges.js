// Achievement badge award logic — the SERVER side. Re-derives which badge
// ids a user has earned from their full stored workout history on every
// logWorkout (see economy.js), so a client can never grant itself one.
//
// Deliberate CommonJS duplicate of the id list in src/data/badges.js (the
// app is ESM, functions/ is CJS — same trade-off as records.js ↔
// src/utils/personalRecords.js). This file holds NO display metadata; if
// you add/rename a badge id, change both files.

const BENCH_EXERCISE_ID = 'bench-press';
const BENCH_CLUB_KG = 100;
const WORKOUTS_MILESTONE = 50;
const STREAK_DAYS = 7;
const RELATIVE_TITAN_SET_SCORE = 2.0;
const DAY_MS = 24 * 60 * 60 * 1000;

// Recovery workouts (logged after a long layoff — see economy.js) are
// un-rewarded everywhere else (no coins, no PRs, no lifetime volume); they
// don't move badges either.
function rewardable(workouts) {
  return (workouts ?? []).filter((w) => w && !w.recoveryWorkout);
}

function* completedSets(workout) {
  for (const exercise of workout?.exercises ?? []) {
    for (const set of exercise?.sets ?? []) {
      if (set && set.completed !== false) yield { set, exerciseId: exercise.exerciseId };
    }
  }
}

// Consecutive calendar days (UTC) with a rewardable workout, counted back
// from the most recent one. Once it has ever reached STREAK_DAYS the badge
// is earned for good — an achievement, not a live counter — so a later
// gap doesn't take it away (badges are only ever added, never removed).
function currentStreakDays(workouts) {
  const days = [
    ...new Set(
      rewardable(workouts)
        .filter((w) => typeof w.finishedAt === 'string')
        .map((w) => Math.floor(Date.parse(w.finishedAt) / DAY_MS))
        .filter((n) => Number.isFinite(n)),
    ),
  ].sort((a, b) => b - a);

  if (days.length === 0) return 0;
  let streak = 1;
  for (let i = 1; i < days.length; i += 1) {
    if (days[i] === days[i - 1] - 1) streak += 1;
    else break;
  }
  return streak;
}

// Given the user's full workout history (the in-progress workout appended,
// carrying finishedAt + per-set relativeVolume), returns the Set of badge
// ids they qualify for. Pure and deterministic.
function evaluateBadges(workouts) {
  const earned = new Set();
  const history = rewardable(workouts);

  if (history.filter((w) => typeof w.finishedAt === 'string').length >= WORKOUTS_MILESTONE) {
    earned.add('workouts-50');
  }

  if (currentStreakDays(workouts) >= STREAK_DAYS) {
    earned.add('streak-7');
  }

  for (const workout of history) {
    for (const { set, exerciseId } of completedSets(workout)) {
      const weight = Number(set.weight);
      if (exerciseId === BENCH_EXERCISE_ID && Number.isFinite(weight) && weight >= BENCH_CLUB_KG) {
        earned.add('bench-100kg');
      }
      const rel = Number(set.relativeVolume);
      if (Number.isFinite(rel) && rel >= RELATIVE_TITAN_SET_SCORE) {
        earned.add('relative-titan');
      }
    }
  }

  return earned;
}

module.exports = { evaluateBadges };
