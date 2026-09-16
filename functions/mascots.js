// Server-side twin of src/data/mascots.js's resolver.
//
// Deliberately a twin and not an import: functions/ is CommonJS and ships
// as its own bundle, and the client module carries sprite paths and a
// React-facing shape that have no meaning here. What DOES have to agree is
// the rule — explicit `mascot` wins, else `gender === 'female'` means Gena,
// else Jimmy — because both sides resolve it and a disagreement would show
// as your own avatar and your feed post being different characters.
//
// firestore.rules pins the writable values to the same two ids, so this is
// the third copy of that list and the reason each one names the others.

const MASCOT_JIMMY = 'jimmy';
const MASCOT_GENA = 'gena';
const MASCOT_IDS = [MASCOT_JIMMY, MASCOT_GENA];
const DEFAULT_MASCOT_ID = MASCOT_JIMMY;

// Takes a user document (or anything carrying the same two fields) and
// returns the id to stamp onto whatever is being published. Never throws
// and never returns undefined: every caller writes the result straight
// into a document, and an undefined there is a Firestore error at best and
// a missing avatar at worst.
function resolveMascotId(userData) {
  const data = userData || {};
  if (MASCOT_IDS.includes(data.mascot)) return data.mascot;
  // Only 'female' maps away from the default — 'other' and an unanswered
  // gender both stay on Jimmy, since there is no third character.
  if (data.gender === 'female') return MASCOT_GENA;
  return DEFAULT_MASCOT_ID;
}

module.exports = {
  MASCOT_JIMMY,
  MASCOT_GENA,
  MASCOT_IDS,
  DEFAULT_MASCOT_ID,
  resolveMascotId,
};
