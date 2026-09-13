// Achievement badge award logic — the SERVER side.
//
// Every predicate is a pure function of the users/{uid}/meta/records
// aggregate (see records.js) plus the lifter's current body weight, never
// a re-scan of workout history. That is what makes them correct both
// going forward AND retroactively: buildRecordsSnapshot seeds every field
// these read — bestPerExercise, workoutCount, streakDays, maxSetScore,
// maxWorkoutVolumeKg — from a user's full history the ONE time their
// aggregate doc is first built, so a veteran account gets credit for
// sessions it logged before any of these badges existed.
//
// Deliberate CommonJS duplicate of the id list in src/data/badges.js (the
// app is ESM, functions/ is CJS — same trade-off as records.js ↔
// src/utils/personalRecords.js). This file holds NO display metadata; if
// you add or rename a badge id, change both files.

// Exercise ids come from the seed catalog (src/data/exercises.js, mirrored
// for the server's bodyweight list in functions/exercises.js). A custom
// exercise someone types themselves gets its own id and can never satisfy
// these — which is the point: "100 kg bench" has to mean the bench.
const BENCH_EXERCISE_ID = 'bench-press';
const SQUAT_EXERCISE_ID = 'squat';
const DEADLIFT_EXERCISE_ID = 'deadlift';
const OHP_EXERCISE_ID = 'overhead-press';
const PULLUP_EXERCISE_ID = 'pull-up';
// The catalog has no FLAT dumbbell bench press — the incline is the only
// dumbbell pressing movement in it, so that is what this badge measures.
// Add a flat variant to the catalog and this id should move with it.
const DB_PRESS_EXERCISE_ID = 'incline-db-press';

const BENCH_CLUB_KG = 100;
const SQUAT_CLUB_KG = 140;
const OHP_CLUB_KG = 60;
const DEADLIFT_CLUB_KG = 200;
const DB_PRESS_KG = 40;
const PULLUP_ADDED_KG = 20;
const BIG_THREE_TOTAL_KG = 500;
const DEADLIFT_BODYWEIGHT_MULTIPLE = 2;
const TEN_TON_KG = 10_000;
const WORKOUTS_MILESTONE = 50;
const STREAK_DAYS = 7;
const RELATIVE_TITAN_SET_SCORE = 2.0;

const best = (records, id) => records?.bestPerExercise?.[id] ?? null;
const bestKg = (records, id) => Number(best(records, id)?.weight) || 0;

// `options.bodyWeightKg` is the lifter's latest logged weight. Two badges
// are relative to it, and it moves — so the comparison is always "this
// lift against what you weigh NOW". Cutting weight can therefore earn you
// one; it can never take one away, because badges are only ever added
// (arrayUnion in economy.js), never removed.
function evaluateBadges(records, { bodyWeightKg = 0 } = {}) {
  const earned = new Set();
  const bw = Number(bodyWeightKg) || 0;

  const bench = bestKg(records, BENCH_EXERCISE_ID);
  const squat = bestKg(records, SQUAT_EXERCISE_ID);
  const deadlift = bestKg(records, DEADLIFT_EXERCISE_ID);

  if (bench >= BENCH_CLUB_KG) earned.add('bench-100kg');
  if (squat >= SQUAT_CLUB_KG) earned.add('squat-140kg');
  if (deadlift >= DEADLIFT_CLUB_KG) earned.add('deadlift-200kg');
  if (bestKg(records, OHP_EXERCISE_ID) >= OHP_CLUB_KG) earned.add('ohp-60kg');
  if (bestKg(records, DB_PRESS_EXERCISE_ID) >= DB_PRESS_KG) earned.add('db-press-40kg');

  // The powerlifting total. Uses each lift's heaviest logged SET, not an
  // estimated one-rep max: this app stores what was actually lifted and
  // never asks for a 1RM, so inventing one from an Epley formula would
  // hand out the badge for work nobody did. A 500 total here means three
  // real sets adding to 500 kg.
  if (bench + squat + deadlift >= BIG_THREE_TOTAL_KG) earned.add('total-500kg');

  // Bodyweight-relative. Guarded on bw > 0 so an account with no weigh-in
  // on file cannot satisfy them by comparing against zero.
  if (bw > 0 && bench >= bw) earned.add('bench-bodyweight');
  if (bw > 0 && deadlift >= bw * DEADLIFT_BODYWEIGHT_MULTIPLE) earned.add('deadlift-2x-bw');

  // Belt weight only — the badge is for what you HUNG on yourself, not for
  // what you weigh. bestPerExercise carries addedWeight for bodyweight
  // lifts (records.js's bestSetOf); entries written before it did have no
  // such field and simply read 0 until that exercise's record is beaten.
  if ((Number(best(records, PULLUP_EXERCISE_ID)?.addedWeight) || 0) >= PULLUP_ADDED_KG) {
    earned.add('pullup-20kg');
  }

  if ((records?.maxWorkoutVolumeKg ?? 0) >= TEN_TON_KG) earned.add('ten-ton-titan');

  // The three that predate this set. Kept because they are already sitting
  // in real users' `badges` arrays, and dropping an id from the registry
  // would leave those entries pointing at nothing.
  if ((records?.workoutCount ?? 0) >= WORKOUTS_MILESTONE) earned.add('workouts-50');
  if ((records?.streakDays ?? 0) >= STREAK_DAYS) earned.add('streak-7');
  if ((records?.maxSetScore ?? 0) >= RELATIVE_TITAN_SET_SCORE) earned.add('relative-titan');

  return earned;
}

module.exports = {
  evaluateBadges,
  BENCH_EXERCISE_ID,
  SQUAT_EXERCISE_ID,
  DEADLIFT_EXERCISE_ID,
  OHP_EXERCISE_ID,
  PULLUP_EXERCISE_ID,
  DB_PRESS_EXERCISE_ID,
  BENCH_CLUB_KG,
  SQUAT_CLUB_KG,
  OHP_CLUB_KG,
  DEADLIFT_CLUB_KG,
  DB_PRESS_KG,
  PULLUP_ADDED_KG,
  BIG_THREE_TOTAL_KG,
  DEADLIFT_BODYWEIGHT_MULTIPLE,
  TEN_TON_KG,
  WORKOUTS_MILESTONE,
  STREAK_DAYS,
  RELATIVE_TITAN_SET_SCORE,
};
