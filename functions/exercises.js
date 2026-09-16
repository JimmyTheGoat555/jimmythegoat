// The server's copy of which seed exercises are bodyweight — a deliberate
// duplicate of the `isBodyweight: true` flags in src/data/exercises.js,
// same ESM/CJS split reason as storeCatalog.js ↔ storeItems.js. If you
// flag a new seed exercise there, add its id here too.
//
// economy.js's validateAndScoreWorkout uses this (not a flag from the
// client payload) to decide whether to fold the user's body weight into a
// set's volume — a client could otherwise mark a barbell lift bodyweight
// to inflate its score.
const BODYWEIGHT_EXERCISE_IDS = new Set([
  'push-up',
  'dips',
  'pull-up',
  'chin-up',
  'triceps-dip',
  'hanging-leg-raise',
  'ab-wheel',
]);

// The server's copy of which seed exercises are loaded a dumbbell in each
// hand — same ESM/CJS duplication as the set above, mirroring
// `equipment: 'dumbbell'` in src/data/exercises.js.
//
// Used for two things, both of which must be the server's answer rather
// than the client's: deciding that a set's `weight` is the absolute pair
// (so the per-hand context fields are stored consistently), and the
// one-time normalization of stored personal bests — see economy.js's
// normalizeDumbbellRecords for why that exists.
//
// A DUMBBELL IN EACH HAND — that is the membership test, not "has the word
// dumbbell in its name". deriveWeight DOUBLES the number it is handed for
// anything in here, so a one-implement movement listed below would be
// scored at twice the load actually lifted. Those carry
// `equipment: 'dumbbell-single'` in src/data/exercises.js instead and are
// deliberately absent here: single-arm row, goblet squat, overhead
// extension. Adding one of them to this Set is the same bug as mislabelling
// it there, which is why both files say so.
const DUMBBELL_EXERCISE_IDS = new Set([
  'incline-db-press',
  'chest-fly',
  'bulgarian-split-squat',
  'arnold-press',
  'lateral-raise',
  'front-raise',
  'rear-delt-fly',
  'shrug',
  'db-curl',
  'hammer-curl',
  'incline-db-curl',
  // PRE-EXISTING AND LEFT ALONE, though a Russian twist is one weight held
  // in both hands and so belongs with the singles above by the rule in
  // this comment. It has been doubling since the per-hand format shipped;
  // correcting it now would halve the score of a movement people are
  // already logging and move their stored best, so it is a deliberate
  // decision to make, not a tidy-up to slip into a list expansion.
  'russian-twist',
]);

// Likewise for the bar. Only used to decide whether the barbell context
// fields (barWeight / weightPerSide) are meaningful on a set; the stored
// `weight` is the whole loaded bar either way, which is what it has always
// been, so nothing about scoring changes for these.
const BARBELL_EXERCISE_IDS = new Set([
  'bench-press',
  'decline-bench-press',
  'deadlift',
  'barbell-row',
  't-bar-row',
  'squat',
  'romanian-deadlift',
  'overhead-press',
  'barbell-curl',
  'preacher-curl',
  'skull-crusher',
  'close-grip-bench',
]);

// Empty-bar weights the client may claim. A free-form number here would
// let a payload put a 500 kg "bar" under a set and have the stored total
// agree with itself — the range check on `weight` still bounds the damage,
// but there is no reason to accept a bar that does not exist.
const ALLOWED_BAR_WEIGHTS = new Set([0, 10, 15, 20, 25]);

module.exports = {
  BODYWEIGHT_EXERCISE_IDS,
  DUMBBELL_EXERCISE_IDS,
  BARBELL_EXERCISE_IDS,
  ALLOWED_BAR_WEIGHTS,
};
