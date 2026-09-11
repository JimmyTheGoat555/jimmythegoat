// Achievement badge award logic — the SERVER side. Every predicate is a
// pure function of the users/{uid}/meta/records aggregate (see
// records.js) rather than a re-scan of workout history: bench-100kg reads
// the running best-per-exercise, relative-titan reads the running max
// single-set score, workouts-50/streak-7 read running counters. All four
// are correct both going forward AND retroactively — buildRecordsSnapshot
// (records.js) seeds every one of these fields from a user's full history
// the ONE time their aggregate doc is first built, so a veteran account
// doesn't have to wait for future workouts to get credit for past ones.
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

function evaluateBadgesFromRecords(records) {
  const earned = new Set();
  if ((records?.bestPerExercise?.[BENCH_EXERCISE_ID]?.weight ?? 0) >= BENCH_CLUB_KG) earned.add('bench-100kg');
  if ((records?.workoutCount ?? 0) >= WORKOUTS_MILESTONE) earned.add('workouts-50');
  if ((records?.streakDays ?? 0) >= STREAK_DAYS) earned.add('streak-7');
  if ((records?.maxSetScore ?? 0) >= RELATIVE_TITAN_SET_SCORE) earned.add('relative-titan');
  return earned;
}

module.exports = {
  evaluateBadgesFromRecords,
  BENCH_EXERCISE_ID,
  BENCH_CLUB_KG,
  WORKOUTS_MILESTONE,
  STREAK_DAYS,
  RELATIVE_TITAN_SET_SCORE,
};
