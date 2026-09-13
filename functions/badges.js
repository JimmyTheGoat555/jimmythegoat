// Achievement badge award logic — the SERVER side.
//
// Ten lifting categories at bronze/silver/gold, plus three single-tier
// originals. Every predicate is a pure function of the
// users/{uid}/meta/records aggregate (records.js) plus current body
// weight, never a re-scan of workout history. That is what makes them
// retroactive: buildRecordsSnapshot seeds every field these read —
// bestPerExercise, workoutCount, streakDays, maxSetScore,
// maxWorkoutVolumeKg — from full history the ONE time an aggregate doc is
// built, so a veteran account gets credit for sessions logged before any
// of these existed.
//
// TIERS ARE CUMULATIVE, NOT EXCLUSIVE. Someone who benches 100 kg on day
// one earns bronze, silver AND gold in that instant — the thresholds are
// a ladder you have provably climbed, not a rank you are assigned. This
// is why each tier is a separate id rather than one id with a level
// field: economy.js diffs against what is already held and appends only
// the new ones, so the celebration names exactly what just happened.
//
// The gold ids are the flat ids this app shipped before tiering, kept
// deliberately so nothing already awarded orphans. See src/data/badges.js.
//
// Deliberate CommonJS duplicate of the thresholds in src/data/badges.js
// (the app is ESM, functions/ is CJS). That file holds display metadata
// and no numbers; this one holds numbers and no display metadata.

// Exercise ids come from the seed catalog (src/data/exercises.js). A
// custom exercise someone types themselves gets its own id and can never
// satisfy these — "100 kg bench" has to mean the bench.
const BENCH_EXERCISE_ID = 'bench-press';
const SQUAT_EXERCISE_ID = 'squat';
const DEADLIFT_EXERCISE_ID = 'deadlift';
const OHP_EXERCISE_ID = 'overhead-press';
const PULLUP_EXERCISE_ID = 'pull-up';
// The catalog has no FLAT dumbbell bench press — the incline is its only
// dumbbell pressing movement, so that is what this measures. Add a flat
// variant to the catalog and this id should move with it.
const DB_PRESS_EXERCISE_ID = 'incline-db-press';

// [threshold, badgeId] per tier, bronze → gold.
const LADDERS = {
  benchAbsolute: [
    [60, 'bench-60kg'],
    [80, 'bench-80kg'],
    [100, 'bench-100kg'],
  ],
  benchRelative: [
    [0.5, 'bench-half-bw'],
    [0.75, 'bench-075-bw'],
    [1, 'bench-bodyweight'],
  ],
  squat: [
    [80, 'squat-80kg'],
    [110, 'squat-110kg'],
    [140, 'squat-140kg'],
  ],
  deadliftAbsolute: [
    [100, 'deadlift-100kg'],
    [140, 'deadlift-140kg'],
    [200, 'deadlift-200kg'],
  ],
  deadliftRelative: [
    [1, 'deadlift-1x-bw'],
    [1.5, 'deadlift-15x-bw'],
    [2, 'deadlift-2x-bw'],
  ],
  ohp: [
    [40, 'ohp-40kg'],
    [50, 'ohp-50kg'],
    [60, 'ohp-60kg'],
  ],
  dbPress: [
    [20, 'db-press-20kg'],
    [30, 'db-press-30kg'],
    [40, 'db-press-40kg'],
  ],
  pullup: [
    [5, 'pullup-5kg'],
    [10, 'pullup-10kg'],
    [20, 'pullup-20kg'],
  ],
  powerTotal: [
    [200, 'total-200kg'],
    [350, 'total-350kg'],
    [500, 'total-500kg'],
  ],
  dailyVolume: [
    [3000, 'volume-3t'],
    [6000, 'volume-6t'],
    [10000, 'ten-ton-titan'],
  ],
};

const WORKOUTS_MILESTONE = 50;
const STREAK_DAYS = 7;
const RELATIVE_TITAN_SET_SCORE = 2.0;

const best = (records, id) => records?.bestPerExercise?.[id] ?? null;
const bestKg = (records, id) => Number(best(records, id)?.weight) || 0;

// Every tier at or below `value` is earned. Not just the highest: a
// lifter who walks in and benches 100 has genuinely cleared 60 and 80,
// and awarding only gold would leave two permanent holes in their shelf.
function awardLadder(earned, ladder, value) {
  if (!Number.isFinite(value) || value <= 0) return;
  for (const [threshold, id] of ladder) if (value >= threshold) earned.add(id);
}

// `options.bodyWeightKg` is the lifter's latest logged weight. The two
// relative ladders move with it — the comparison is always "this lift
// against what you weigh NOW". Cutting weight can therefore earn a tier;
// nothing can take one away, because badges are only ever added
// (arrayUnion in economy.js), never removed.
function evaluateBadges(records, { bodyWeightKg = 0 } = {}) {
  const earned = new Set();
  const bw = Number(bodyWeightKg) || 0;

  const bench = bestKg(records, BENCH_EXERCISE_ID);
  const squat = bestKg(records, SQUAT_EXERCISE_ID);
  const deadlift = bestKg(records, DEADLIFT_EXERCISE_ID);

  awardLadder(earned, LADDERS.benchAbsolute, bench);
  awardLadder(earned, LADDERS.squat, squat);
  awardLadder(earned, LADDERS.deadliftAbsolute, deadlift);
  awardLadder(earned, LADDERS.ohp, bestKg(records, OHP_EXERCISE_ID));
  awardLadder(earned, LADDERS.dbPress, bestKg(records, DB_PRESS_EXERCISE_ID));

  // The powerlifting total. Each lift's heaviest logged SET, not an
  // estimated one-rep max: this app never asks for a 1RM, so deriving one
  // from an Epley formula would award tiers for work nobody did.
  awardLadder(earned, LADDERS.powerTotal, bench + squat + deadlift);

  // Belt weight only — the badge is for what you HUNG on yourself, not
  // what you weigh. bestPerExercise carries addedWeight for bodyweight
  // lifts (records.js's bestSetOf); entries written before it did have no
  // such field and read 0 until that exercise's record is next beaten.
  awardLadder(earned, LADDERS.pullup, Number(best(records, PULLUP_EXERCISE_ID)?.addedWeight) || 0);

  awardLadder(earned, LADDERS.dailyVolume, records?.maxWorkoutVolumeKg ?? 0);

  // Relative ladders are ratios, and are skipped entirely without a
  // weigh-in on file — otherwise a missing body weight would divide into
  // nothing and hand out bronze for free.
  if (bw > 0) {
    awardLadder(earned, LADDERS.benchRelative, bench / bw);
    awardLadder(earned, LADDERS.deadliftRelative, deadlift / bw);
  }

  if ((records?.workoutCount ?? 0) >= WORKOUTS_MILESTONE) earned.add('workouts-50');
  if ((records?.streakDays ?? 0) >= STREAK_DAYS) earned.add('streak-7');
  if ((records?.maxSetScore ?? 0) >= RELATIVE_TITAN_SET_SCORE) earned.add('relative-titan');

  return earned;
}

module.exports = {
  evaluateBadges,
  LADDERS,
  BENCH_EXERCISE_ID,
  SQUAT_EXERCISE_ID,
  DEADLIFT_EXERCISE_ID,
  OHP_EXERCISE_ID,
  PULLUP_EXERCISE_ID,
  DB_PRESS_EXERCISE_ID,
  WORKOUTS_MILESTONE,
  STREAK_DAYS,
  RELATIVE_TITAN_SET_SCORE,
};
