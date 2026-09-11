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
]);

module.exports = { BODYWEIGHT_EXERCISE_IDS };
