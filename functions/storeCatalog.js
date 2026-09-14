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
// Extra load strapped on for a bodyweight exercise (a dip/pull-up belt).
// 150 kg is already far past anything real — it's a sanity cap on a
// client-supplied number, not a training limit.
const MAX_ADDED_WEIGHT_KG = 150;

// The body weight used as the DIVISOR in relative-volume scoring is
// clamped to this range. users/{uid}/meta/profile.bodyWeightLog is
// owner-writable (it's personal health data, not otherwise validated), so
// without this a cheater could set their weight to 1 kg and make a
// 100 kg bench read as 100× relative volume per rep. A pure bodyweight
// set is unaffected — its ratio is body/body = 1 regardless.
const MIN_BODYWEIGHT_KG = 30;
const MAX_BODYWEIGHT_KG = 300;
// A generous sanity cap on how many sets one workout can contain — not a
// realistic training limit, just a backstop against someone submitting a
// single workout with thousands of sets to try to brute-force past the
// per-workout coin cap below via sheer volume.
const MAX_SETS_PER_WORKOUT = 100;
// Same idea, one level up: MAX_SETS_PER_WORKOUT only bounds COMPLETED
// sets, so a payload of e.g. 50,000 near-empty exercise objects (0 sets
// each, or all-incomplete) would still make validateAndScoreWorkout
// iterate the whole array — real CPU work, and a large request body,
// before a single "no sets" rejection fires. No real routine comes close
// to this; it's a backstop, not a training limit.
const MAX_EXERCISES_PER_WORKOUT = 40;

// How far `startedAt` (client-supplied, used only for the displayed
// workout duration) is allowed to drift from "now" before it's rejected
// in favor of the server's own finishedAt timestamp. Generous enough for
// a very long real session or a slightly stale client clock; anything
// outside this window is either clock skew nobody should trust or a
// deliberate attempt to fake a workout's duration.
const MAX_STARTED_AT_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

// The neglect/recovery mechanic (below) only actually lifts the penalty if
// the comeback workout clears this bar. Without it, the cheapest possible
// workout (one set, one rep) is just as good at resetting the clock as a
// real session, making the "log something real to recover" requirement a
// formality — see economy.js's neglectPenaltyLifted. ~20 points is a fifth
// of an average session (~100), high enough that a token 1-rep set can't
// clear it under realistic weights.
const RECOVERY_MIN_SCORE = 20;

// ---- Anti-abuse: rolling-window cap ----
// Keyed off users/{uid}/meta/economy, which only this server code (via the
// Admin SDK) ever writes — see firestore.rules' `docId != 'economy'`
// exclusion on the wildcard meta/{docId} rule for why a client can't just
// reset this itself (a real, exploited-in-audit hole before that existed).
//
// ONE rule now: four hours between logged workouts. Nothing else.
//
// What this replaced, and why the change is a simplification rather than a
// loosening: a 1-hour gap PLUS a hard cap of 2 per rolling 24 hours. The
// cap was the part that hurt. Six hours after training twice you were
// simply locked out for the rest of the day, with no way to see it coming
// — and the two rules disagreed about what they were for, one spacing
// sessions and the other rationing them.
//
// A single 4h gap does the same job the cap was really doing (it bounds a
// day at six sessions, which no human reaches by accident) while staying
// explainable in one sentence and, crucially, PREDICTABLE: there is
// exactly one number to show a countdown against, which is what makes the
// client-side lock on the Workout tab honest — see
// src/hooks/useWorkoutCooldown.js, whose COOLDOWN_MS must match this.
const WORKOUT_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours between logs

// How long a log entry is kept in users/{uid}/meta/economy.recentWorkoutLogs,
// and the hard bound on that array. Only the newest entry decides the
// cooldown; the rest are kept as a short trail (the client reads this doc
// to render its countdown) and pruned so the array cannot grow without
// bound over a lifetime of training.
const LOG_HISTORY_MS = 24 * 60 * 60 * 1000;
const MAX_LOG_HISTORY = 12;

// ---- Neglect / comeback mechanic ----
// If this many days (or more) have passed since the user's last logged
// workout, the FIRST workout back is a "recovery workout": it refreshes
// their training clock (which lifts the client-side 1-tier neglect
// penalty — see src/utils/evolutionTiers.js) but earns no coins and adds
// nothing to lifetime volume. A second, normal workout is then needed to
// actually progress again. Same 5-day threshold the frontend penalty
// uses, kept here as the server's authoritative copy.
const NEGLECT_RECOVERY_DAYS = 5;
const NEGLECT_RECOVERY_MS = NEGLECT_RECOVERY_DAYS * 24 * 60 * 60 * 1000;

// ---- Progression: Relative Strength Volume ----
// The score that drives coins + the lifetime total + evolution tiers is
// now strength-relative, not raw kg: each set contributes
// (effectiveLoad / bodyWeight) * reps, where effectiveLoad is the entered
// weight, or (bodyWeight + belt) for a bodyweight exercise. A typical
// session lands near ~100 points, which is why the tiers sit at
// 0 / 400 / 2000 / 5000 (roughly 4 / 20 / 50 workouts) — see
// src/utils/evolutionTiers.js.
//
// COINS_PER_RELATIVE_POINT sets the payout rate: a typical session is
// worth ~100 relative points, so ~100 * 2 ≈ 200 coins per average
// workout. Still hard-capped by MAX_COINS_PER_WORKOUT so one enormous
// in-bounds session can't outpace training consistently.
const COINS_PER_RELATIVE_POINT = 2.0;
const MAX_COINS_PER_WORKOUT = 500;
// Paid to the FRIEND who recommended a routine, the first time the person
// who accepted it actually trains it (economy.js). Deliberately a quarter
// of a typical session's own payout: enough that sending someone a good
// workout is worth doing, nowhere near enough to make recommending a
// better way to earn than lifting. Paid once per accepted recommendation,
// never per session — see functions/acceptRecommendation.js.
const RECOMMENDATION_BOUNTY_COINS = 50;

// ---- Rewarded ads ----
// Paid for watching a sponsor video (functions/rewardAdView.js).
//
// THE NUMBER MATTERS MORE THAN IT LOOKS. Coins are what this app pays for
// TRAINING — a typical session earns around 200 (COINS_PER_RELATIVE_POINT
// above), and the store prices everything against that. At 50 a view and
// one view a day (guards.js), ads top out at a quarter of a session: a
// nudge toward the shop, never a substitute for the gym. Raising either
// number past that inverts the app's own incentive, so raise neither
// without deciding to.
//
// Never, under any circumstances, does an ad grant volume, score, a PR or
// a badge. Coins are a currency; the rest is a record of what somebody
// actually lifted.
const AD_REWARD_COINS = 50;

// Divisor for workouts logged BEFORE relative scoring existed (no stored
// `score` / per-set `relativeVolume`): their raw kg volume is mapped onto
// the new scale against an average 75 kg lifter, so existing users don't
// snap back to Goat on the migration. Approximate by nature — kept as one
// constant so the client (src/utils/workoutStats.js) and records.js agree.
const LEGACY_BODYWEIGHT_KG = 75;

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
//
// Repriced so the catalog reads as a real status ladder against the
// ~200-coin/workout payout above (COINS_PER_RELATIVE_POINT): accessories
// are a session or three, dances are a deliberate, multi-session flex —
// the Crown and Moonwalk are the two "I've clearly put in the time" items
// at the top of each track.
const STORE_ITEMS = [
  { id: 'dance-shuffle', type: 'dance', name: 'The Shuffle', emoji: '🕺', cost: 600 },
  { id: 'dance-headbang', type: 'dance', name: 'Headbanger', emoji: '🤘', cost: 800 },
  { id: 'dance-victory', type: 'dance', name: 'Victory Lap', emoji: '🏆', cost: 1100 },
  { id: 'dance-moonwalk', type: 'dance', name: 'Moonwalk', emoji: '🌙', cost: 1500 },
  { id: 'accessory-cap', type: 'accessory', name: 'Ball Cap', emoji: '🧢', cost: 150, slot: 'head', rarity: 'common' },
  { id: 'accessory-shades', type: 'accessory', name: 'Shades', emoji: '🕶️', cost: 250, slot: 'eyes', rarity: 'common' },
  { id: 'accessory-tank', type: 'accessory', name: 'White Tank', emoji: '🎽', cost: 300, slot: 'body', rarity: 'common' },
  { id: 'accessory-jeans', type: 'accessory', name: 'Ripped Jeans', emoji: '👖', cost: 400, slot: 'legs', rarity: 'rare' },
  { id: 'accessory-hoodie', type: 'accessory', name: 'Cutoff Hoodie', emoji: '🧥', cost: 450, slot: 'body', rarity: 'rare' },
  { id: 'accessory-headphones', type: 'accessory', name: 'Studio Headphones', emoji: '🎧', cost: 700, slot: 'head', rarity: 'rare' },
];

const STORE_ITEMS_BY_ID = new Map(STORE_ITEMS.map((item) => [item.id, item]));

// Coins credited to an EXISTING user when someone signs up using their
// friend code — see functions/referral.js. Paid once per new account (not
// per friendship — see that file for why becoming friends stays a
// separate, mutual-consent action rather than something a signup-time
// code can wire up unilaterally).
const REFERRAL_BONUS_COINS = 150;

// The dance handed out for free by the first-workout Silver Lootbox (see
// economy.js's logWorkout) — deliberately the cheapest dance in the
// catalog above, so "free" still reads as a real discount rather than
// devaluing the item itself.
const STARTER_DANCE_ID = 'dance-shuffle';

module.exports = {
  MIN_WEIGHT_KG,
  MAX_WEIGHT_KG,
  MIN_REPS,
  MAX_REPS,
  MAX_ADDED_WEIGHT_KG,
  MIN_BODYWEIGHT_KG,
  MAX_BODYWEIGHT_KG,
  MAX_SETS_PER_WORKOUT,
  MAX_EXERCISES_PER_WORKOUT,
  MAX_STARTED_AT_AGE_MS,
  WORKOUT_COOLDOWN_MS,
  LOG_HISTORY_MS,
  MAX_LOG_HISTORY,
  NEGLECT_RECOVERY_DAYS,
  NEGLECT_RECOVERY_MS,
  RECOVERY_MIN_SCORE,
  COINS_PER_RELATIVE_POINT,
  MAX_COINS_PER_WORKOUT,
  RECOMMENDATION_BOUNTY_COINS,
  AD_REWARD_COINS,
  LEGACY_BODYWEIGHT_KG,
  STORE_ITEMS,
  STORE_ITEMS_BY_ID,
  REFERRAL_BONUS_COINS,
  STARTER_DANCE_ID,
};
