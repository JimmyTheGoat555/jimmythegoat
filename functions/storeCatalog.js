// Server-side source of truth for the coin economy: workout validation
// bounds, anti-abuse limits, the reward formula, and the item catalog
// (prices included). Nothing in here is ever trusted from the client —
// see economy.js for why: a client could always call the callable
// functions directly with whatever payload it wants, bypassing any UI.
// `src/data/storeItems.js` has a matching DISPLAY-ONLY copy of the catalog
// for the shop UI to render without a round trip; if you add/change an
// item, update both, but only THIS file's prices are ever actually
// charged.

// ---- Workout validation bounds ----
// Same numbers the client clamps to in SetRow.jsx for immediate feedback —
// enforced again here because client-side validation only ever prevents
// accidents, never a deliberate direct call to logWorkout().
const MIN_WEIGHT_KG = 1;
const MAX_WEIGHT_KG = 250;
const MIN_REPS = 1;
const MAX_REPS = 30;
// A generous sanity cap on how many sets one workout can contain — not a
// realistic training limit, just a backstop against someone submitting a
// single workout with thousands of sets to try to brute-force past the
// per-workout coin cap below via sheer volume.
const MAX_SETS_PER_WORKOUT = 100;

// ---- Anti-abuse: rolling-window cap ----
// Keyed off users/{uid}/meta/economy, which only this server code (via the
// Admin SDK) ever writes — see firestore.rules' `docId != 'economy'`
// exclusion on the wildcard meta/{docId} rule for why a client can't just
// reset this itself (a real, exploited-in-audit hole before that existed).
//
// A rolling 24h window, not a UTC-midnight reset: "2 in the last 24 hours"
// means exactly that at any moment, not "2 since midnight" (which would let
// someone log at 23:59 and again at 00:01, ninety seconds apart). MIN_GAP_MS
// is the spacing required between any two consecutive logs — with the cap
// at 2, that is simply the gap between the pair.
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours, rolling
const MIN_GAP_MS = 60 * 60 * 1000; // 1 hour between consecutive logs
const MAX_WORKOUTS_PER_WINDOW = 2;

// ---- Reward formula ----
// 1 coin per 20kg of validated total volume (sum of weight*reps across
// every set), hard-capped per workout so one enormous-but-technically-
// in-bounds session (e.g. 250kg x 30reps x 100 sets) can't outpace actually
// training consistently over time.
const COINS_PER_VOLUME_KG = 1 / 20;
const MAX_COINS_PER_WORKOUT = 500;

// ---- Item catalog ----
// type: 'dance' | 'accessory'. An equipped dance now actually plays: the
// client maps its id to a numbered animated-WebP clip (per evolution
// stage) that Jimmy performs on WorkoutHome and in the Shop preview — see
// src/utils/danceAnimations.js and JimmyAnimation.jsx. Accessories are
// still just a cosmetic flag — shown as an emoji + name badge on the
// Shop/Profile/FriendProfile, nothing overlaid on the character yet.
// Either way the server only ever cares that these are ids living in the
// user's unlockedDances/unlockedAccessories arrays; all rendering is
// client-side.
const STORE_ITEMS = [
  { id: 'dance-shuffle', type: 'dance', name: 'The Shuffle', emoji: '🕺', cost: 150 },
  { id: 'dance-headbang', type: 'dance', name: 'Headbanger', emoji: '🤘', cost: 150 },
  { id: 'dance-victory', type: 'dance', name: 'Victory Lap', emoji: '🏆', cost: 300 },
  { id: 'dance-moonwalk', type: 'dance', name: 'Moonwalk', emoji: '🌙', cost: 500 },
  { id: 'accessory-cap', type: 'accessory', name: 'Backwards Cap', emoji: '🧢', cost: 100 },
  { id: 'accessory-shades', type: 'accessory', name: 'Shades', emoji: '🕶️', cost: 200 },
  { id: 'accessory-chain', type: 'accessory', name: 'Gold Chain', emoji: '⛓️', cost: 350 },
  { id: 'accessory-crown', type: 'accessory', name: 'Crown', emoji: '👑', cost: 750 },
];

const STORE_ITEMS_BY_ID = new Map(STORE_ITEMS.map((item) => [item.id, item]));

module.exports = {
  MIN_WEIGHT_KG,
  MAX_WEIGHT_KG,
  MIN_REPS,
  MAX_REPS,
  MAX_SETS_PER_WORKOUT,
  WINDOW_MS,
  MIN_GAP_MS,
  MAX_WORKOUTS_PER_WINDOW,
  COINS_PER_VOLUME_KG,
  MAX_COINS_PER_WORKOUT,
  STORE_ITEMS,
  STORE_ITEMS_BY_ID,
};
