// Achievement badge award logic — the SERVER side.
//
// TWO TREES. An account earns from the tree of the character it wears
// (functions/mascots.js's resolveMascotId): Jimmy's tree is the ten
// lifting ladders this app shipped with plus a lifetime-tonnage ladder;
// Gena's is built around what a female lifter's training and milestones
// actually look like — glutes and lower body, core, the first unassisted
// pull-up, push-ups, and tonnage ladders scaled to 0.65 of Jimmy's (the
// same ratio the evolution thresholds and the coin rate use; see
// evolution.js). Three consistency badges — fifty workouts, a week's
// streak, a 2.0 relative set — sit in both, because nothing about them is
// physiological. Anything already awarded stays awarded whatever tree the
// account is on today: economy.js only ever appends (arrayUnion), so an
// account that switches character keeps its shelf and simply starts
// earning from the other list.
//
// Every predicate is a pure function of the users/{uid}/meta/records
// aggregate (records.js) plus current body weight, never a re-scan of
// workout history. That is what makes them retroactive: the aggregate is
// seeded from full history the one time it is built — and the badge
// aggregates the Gena tree reads (set counts, best reps, lifetime kg, the
// lower-body share, the core run) are seeded the same way for docs that
// predate them — so a veteran account gets credit for sessions logged
// before any of these existed.
//
// TIERS ARE CUMULATIVE, NOT EXCLUSIVE. Someone who benches 100 kg on day
// one earns bronze, silver AND gold in that instant — the thresholds are
// a ladder you have provably climbed, not a rank you are assigned. This
// is why each tier is a separate id rather than one id with a level
// field: economy.js diffs against what is already held and appends only
// the new ones, so the celebration names exactly what just happened.
//
// The gold ids of Jimmy's ladders are the flat ids this app shipped before
// tiering, kept deliberately so nothing already awarded orphans. See
// src/data/badges.js.
//
// Deliberate CommonJS duplicate of the thresholds in src/data/badges.js
// (the app is ESM, functions/ is CJS). That file holds display metadata
// and no numbers; this one holds numbers and no display metadata.

const { GLUTE_EXERCISE_IDS } = require('./exercises');
const { MASCOT_GENA } = require('./mascots');

// Exercise ids come from the seed catalog (src/data/exercises.js). A
// custom exercise someone types themselves gets its own id and can never
// satisfy these — "100 kg bench" has to mean the bench.
const BENCH_EXERCISE_ID = 'bench-press';
const SQUAT_EXERCISE_ID = 'squat';
const DEADLIFT_EXERCISE_ID = 'deadlift';
const OHP_EXERCISE_ID = 'overhead-press';
const PULLUP_EXERCISE_ID = 'pull-up';
const PUSHUP_EXERCISE_ID = 'push-up';
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
  // Lifetime tonnage — every kilogram ever moved, added up. New to Jimmy's
  // tree alongside the Gena one below, so the two ladders are the same
  // shape at their two scales.
  lifetimeVolume: [
    [10000, 'volume-king-10t'],
    [50000, 'volume-king-50t'],
    [100000, 'volume-king-100t'],
  ],
};

// Gena's ladders. Where the brief named one number it is the entry tier
// (ten sets of hip thrusts, a 75% leg day, three core sessions running,
// ten push-ups), with two rungs above it to keep chasing; the one
// exception is Squat Queen, where the named 1× bodyweight is the gold —
// a big milestone for a female lifter, and the same 0.5 / 0.75 / 1 shape
// Jimmy's relative bench ladder has. Volume Queen is exactly the brief:
// Jimmy's lifetime ladder at 0.65.
const GENA_LADDERS = {
  // Sets of hip thrusts and glute bridges, added together, ever.
  peach: [
    [10, 'peach-builder-10'],
    [50, 'peach-builder-50'],
    [150, 'peach-builder-150'],
  ],
  // Heaviest squat set as a multiple of body weight.
  squatQueen: [
    [0.5, 'squat-queen-half-bw'],
    [0.75, 'squat-queen-075-bw'],
    [1, 'squat-queen-bw'],
  ],
  // Percent of one session's tonnage that was lower body.
  legDay: [
    [75, 'leg-day-75'],
    [85, 'leg-day-85'],
    [95, 'leg-day-95'],
  ],
  // Consecutive sessions with core work in them.
  core: [
    [3, 'core-steel-3'],
    [7, 'core-steel-7'],
    [14, 'core-steel-14'],
  ],
  // Most push-ups in one set.
  pushup: [
    [10, 'pushup-10'],
    [20, 'pushup-20'],
    [30, 'pushup-30'],
  ],
  lifetimeVolume: [
    [6500, 'volume-queen-6t'],
    [32500, 'volume-queen-32t'],
    [65000, 'volume-queen-65t'],
  ],
};

const FIRST_PULLUP_BADGE = 'first-pullup';

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

// Jimmy's tree — the original lifting ladders, plus lifetime tonnage.
function evaluateJimmy(records, bw) {
  const earned = new Set();

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
  awardLadder(earned, LADDERS.lifetimeVolume, records?.lifetimeVolumeKg ?? 0);

  // Relative ladders are ratios, and are skipped entirely without a
  // weigh-in on file — otherwise a missing body weight would divide into
  // nothing and hand out bronze for free.
  if (bw > 0) {
    awardLadder(earned, LADDERS.benchRelative, bench / bw);
    awardLadder(earned, LADDERS.deadliftRelative, deadlift / bw);
  }

  return earned;
}

// Gena's tree — see GENA_LADDERS. Reads the badge aggregates records.js
// keeps for exactly this (setCountByExercise, bestRepsByExercise,
// lifetimeVolumeKg, maxLowerBodyShare, maxCoreWorkoutRun).
function evaluateGena(records, bw) {
  const earned = new Set();
  const setCounts = records?.setCountByExercise ?? {};
  const bestReps = records?.bestRepsByExercise ?? {};

  let gluteSets = 0;
  for (const id of GLUTE_EXERCISE_IDS) gluteSets += Number(setCounts[id]) || 0;
  awardLadder(earned, GENA_LADDERS.peach, gluteSets);

  // Same rule as Jimmy's relative ladders: no weigh-in, no ratio.
  if (bw > 0) awardLadder(earned, GENA_LADDERS.squatQueen, bestKg(records, SQUAT_EXERCISE_ID) / bw);

  awardLadder(earned, GENA_LADDERS.legDay, (Number(records?.maxLowerBodyShare) || 0) * 100);
  awardLadder(earned, GENA_LADDERS.core, Number(records?.maxCoreWorkoutRun) || 0);

  // An unassisted pull-up is any completed set of the pull-up itself: the
  // catalog's pull-up is bodyweight (plus belt), so a logged rep of it IS
  // the lifter's own weight going up. An assisted machine or a pulldown
  // is a different exercise and never reaches this id. Either record is
  // proof — the set count for accounts seeded after this shipped, the
  // stored best for ones that logged it before the counts existed.
  if ((Number(setCounts[PULLUP_EXERCISE_ID]) || 0) >= 1 || best(records, PULLUP_EXERCISE_ID)) {
    earned.add(FIRST_PULLUP_BADGE);
  }

  awardLadder(earned, GENA_LADDERS.pushup, Number(bestReps[PUSHUP_EXERCISE_ID]) || 0);
  awardLadder(earned, GENA_LADDERS.lifetimeVolume, records?.lifetimeVolumeKg ?? 0);

  return earned;
}

// The three that are about showing up, not about what was lifted. Both
// trees.
function awardShared(earned, records) {
  if ((records?.workoutCount ?? 0) >= WORKOUTS_MILESTONE) earned.add('workouts-50');
  if ((records?.streakDays ?? 0) >= STREAK_DAYS) earned.add('streak-7');
  if ((records?.maxSetScore ?? 0) >= RELATIVE_TITAN_SET_SCORE) earned.add('relative-titan');
  return earned;
}

// `options.bodyWeightKg` is the lifter's latest logged weight. The
// relative ladders move with it — the comparison is always "this lift
// against what you weigh NOW". Cutting weight can therefore earn a tier;
// nothing can take one away, because badges are only ever added
// (arrayUnion in economy.js), never removed.
//
// `options.mascot` picks the tree — 'gena' for Gena's, anything else for
// Jimmy's. The caller resolves it (resolveMascotId) so the rule for who
// is which character lives in one place.
function evaluateBadges(records, { bodyWeightKg = 0, mascot = null } = {}) {
  const bw = Number(bodyWeightKg) || 0;
  const earned = mascot === MASCOT_GENA ? evaluateGena(records, bw) : evaluateJimmy(records, bw);
  return awardShared(earned, records);
}

module.exports = {
  evaluateBadges,
  LADDERS,
  GENA_LADDERS,
  FIRST_PULLUP_BADGE,
  BENCH_EXERCISE_ID,
  SQUAT_EXERCISE_ID,
  DEADLIFT_EXERCISE_ID,
  OHP_EXERCISE_ID,
  PULLUP_EXERCISE_ID,
  PUSHUP_EXERCISE_ID,
  DB_PRESS_EXERCISE_ID,
  WORKOUTS_MILESTONE,
  STREAK_DAYS,
  RELATIVE_TITAN_SET_SCORE,
};
