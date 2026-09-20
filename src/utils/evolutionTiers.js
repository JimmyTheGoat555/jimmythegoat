// Jimmy's evolution tiers, gated by cumulative Relative Strength Volume —
// the sum of every set's (load ÷ body weight) × reps over all history (see
// functions/economy.js and utils/workoutStats.js's lifetimeVolume). A
// typical session is worth ~100 points, so the thresholds below land at
// roughly 4 / 20 / 50 workouts. Same "always something to chase"
// philosophy as before, just on a strength-relative scale instead of raw
// kg tonnage — a 60 kg lifter and a 100 kg lifter benching their own
// bodyweight now progress at the same rate.
//
// ── THE FEMALE SCALE ────────────────────────────────────────────────────
//
// Relative points already make a 60 kg lifter and a 100 kg lifter
// progress alike — but they do not make a woman and a man progress
// alike. Per session, a female lifter moves roughly 60–65% of the
// tonnage a male lifter of the same body weight does, so on the same
// ladder her ~65-point sessions would take six or seven to fill a band a
// man fills in four. So the thresholds are SCALED, not the score: a
// female account climbs the same four tiers with every threshold at
// FEMALE_PROGRESSION_SCALE (0.65) of the table below — buff at 260, titan
// at 1,300, legend at 3,250 — and an average session fills ~25% of the
// bar for both. What a session was WORTH is untouched: the points on the
// summary, the kg on the sticker, the leaderboard score and the coins
// are the same numbers whoever lifted them; only the unseen goal moves.
//
// Who is on which ladder is decided in one place, progressionScale():
// THE LADDER FOLLOWS THE CHARACTER. An explicit `mascot` wins, else a
// 'female' onboarding answer means Gena — the same precedence
// data/mascots.js's resolveMascotId gives the sprite — and whoever
// resolves to Gena climbs the female ladder. So a woman who picks Jimmy
// in Settings climbs Jimmy's ladder, earns Jimmy's coins and Jimmy's
// badge tree, and the Founder Console's mascot swap moves all four at
// once (functions/adminUserActions.js). An 'other' answer with no choice
// stays on the base ladder. The server decides evolutions with the same
// rule (functions/evolution.js's progressionScaleFor) and publishes the
// number it used beside minStage, so a friend's device draws the tier
// the server announced.
//
// The original starting tier ("Kid Goat") was removed at the user's
// request — 4 tiers, not 5. `goat` is the floor at 0 so
// getEvolutionProgress (which treats index 0 as "where everyone starts")
// always gives a brand-new account a real current tier.
export const EVOLUTION_TIERS = [
  {
    id: 'goat',
    label: 'Goat',
    threshold: 0,
    emoji: '🐐',
    image: '/assets/jimmy-goat.png',
    description: 'Everyone starts somewhere. Log your first sets to evolve.',
    // 1-based, matching public/animations/dances/dance{N}/stage{N}.mp4 —
    // see utils/danceAnimations.js. An explicit field rather than deriving it
    // from array position, so reordering/inserting a tier later can never
    // silently shift which video folder a stage points at.
    stage: 1,
  },
  {
    id: 'buff',
    label: 'Buff Goat',
    threshold: 400, // ~4 workouts
    emoji: '🐐',
    image: '/assets/jimmy-buff.png',
    description: 'Real strength is showing. Respect.',
    stage: 2,
  },
  {
    id: 'titan',
    label: 'Titan Goat',
    threshold: 2_000, // ~20 workouts
    emoji: '🐐',
    image: '/assets/jimmy-titan.png',
    description: 'Elite territory. Few make it this far.',
    stage: 3,
  },
  {
    id: 'legend',
    label: 'Legendary G.O.A.T.',
    threshold: 5_000, // ~50 workouts
    emoji: '🐐',
    image: '/assets/jimmy-legend.png',
    description: 'Greatest Of All Time. Max evolution reached.',
    stage: 4,
  },
];

// Neglect penalty: once this many days have passed since the last logged
// workout, the user's EFFECTIVE tier drops by exactly one (never more,
// never below tier 1). Logging any workout refreshes the training clock
// and the penalty lifts on its own. Kept in sync with
// functions/storeCatalog.js's NEGLECT_RECOVERY_DAYS — the server uses the
// same threshold to decide whether the comeback workout is a
// "recovery workout" (earns nothing, just restores the tier).
// Look a tier up by its `stage` rather than by array position — same
// reasoning the stage field itself carries: inserting or reordering a tier
// later must not silently change which sprite a caller gets.
export function getTierByStage(stage) {
  return EVOLUTION_TIERS.find((tier) => tier.stage === stage) ?? EVOLUTION_TIERS.at(-1);
}

// How far a female account's thresholds sit below the table — see THE
// FEMALE SCALE in the header. Twin of functions/evolution.js's constant.
export const FEMALE_PROGRESSION_SCALE = 0.65;
// data/mascots.js's MASCOT_GENA, re-typed rather than imported so this
// module keeps no imports: the server twin mirrors it line for line and
// tools/progression.test.mjs loads both in plain Node.
const FEMALE_MASCOT_ID = 'gena';
const BASE_MASCOT_ID = 'jimmy';

// A scale is a fraction of the table in (0, 1]; anything else — a
// missing field, a tampered post, NaN — is the base ladder.
function normaliseScale(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 1;
}

// The threshold scale for whoever `source` describes: the signed-in
// user's account doc, a friend's public summary, a feed post, a trainee's
// doc — anything carrying `mascot` and/or `gender`, or a number the
// server already published as `progressionScale`. A published number
// wins, because it is the one the server decided that account's tier
// with; otherwise the resolved character decides (THE LADDER FOLLOWS THE
// CHARACTER in the header): an explicit mascot, else the gender default.
// Never throws: every caller feeds the result straight into the maths.
export function progressionScale(source) {
  if (typeof source === 'number') return normaliseScale(source);
  if (!source || typeof source !== 'object') return 1;
  const published = Number(source.progressionScale);
  if (Number.isFinite(published) && published > 0 && published <= 1) return published;
  const mascot =
    source.mascot === FEMALE_MASCOT_ID || source.mascot === BASE_MASCOT_ID
      ? source.mascot
      : source.gender === 'female'
        ? FEMALE_MASCOT_ID
        : BASE_MASCOT_ID;
  return mascot === FEMALE_MASCOT_ID ? FEMALE_PROGRESSION_SCALE : 1;
}

// A tier with its threshold scaled. The table's own object comes back
// untouched on the base ladder, so nothing that compared tiers by
// identity before changes behaviour for anyone it already served.
function scaledTier(index, scale) {
  const tier = EVOLUTION_TIERS[index];
  return scale === 1 ? tier : { ...tier, threshold: tier.threshold * scale };
}

export const NEGLECT_PENALTY_DAYS = 5;
const NEGLECT_PENALTY_MS = NEGLECT_PENALTY_DAYS * 24 * 60 * 60 * 1000;

// True when `lastWorkoutAt` (an ISO string / Date / ms, or null) is at
// least NEGLECT_PENALTY_DAYS in the past. Null — a user who has never
// logged a workout — is NOT neglect: they're at tier 1 anyway, nothing to
// demote.
export function isTierNeglected(lastWorkoutAt, now = Date.now()) {
  if (lastWorkoutAt == null) return false;
  const last = lastWorkoutAt instanceof Date ? lastWorkoutAt.getTime() : new Date(lastWorkoutAt).getTime();
  if (!Number.isFinite(last)) return false;
  return now - last >= NEGLECT_PENALTY_MS;
}

// Resolves a lifetime-volume number to
// { current, next, percent, isMaxTier, neglected, baseTier }.
//
// percent is progress within the CURRENT (effective) tier's band, so the
// bar always fills 0->100 meaningfully instead of stalling near 0 right
// after evolving.
//
// Pass `{ scale }` — progressionScale() of the account being drawn — to
// put the thresholds on that account's ladder: `current`/`next` come back
// with their thresholds scaled (so a goal printed from `next.threshold`
// is the goal that actually applies) and `scale` says what was used.
//
// Pass `{ lastWorkoutAt }` (ISO string from the user's own workout
// history — see src/utils/workoutStats.js's lastWorkoutAt) to apply the
// neglect penalty: `current`/`next`/`percent`/`isMaxTier` then describe
// the demoted tier, `neglected` is true, and `baseTier` is the un-demoted
// tier the volume actually earns (so the UI can say "train to restore
// your Titan tier"). Callers rendering someone ELSE's tier (leaderboard,
// a friend's profile) simply omit it and get the raw, un-penalised
// result.
// The stage a trainer's goat starts at. Coaching accounts skip the first
// evolution phase — someone who shows up to coach other people should not
// be introduced to them as the base goat.
//
// A FLOOR, not a grant: `lifetimeVolume` itself is untouched, so nothing
// downstream that pays out (coins, relative volume, PRs, the leaderboard
// score) is affected. Only which sprite and label they wear.
export const TRAINER_MIN_STAGE = 2;

export function getEvolutionProgress(volume, { lastWorkoutAt, minStage = 1, scale = 1 } = {}) {
  const factor = normaliseScale(scale);
  const thresholdAt = (index) => EVOLUTION_TIERS[index].threshold * factor;
  // Raising the floor raises the volume the rest of this function reasons
  // about, rather than just swapping the label at the end. That keeps
  // `next`, `percent` and `isMaxTier` in agreement with `current`: a
  // floored account reads as standing at the very start of the buff →
  // titan climb, which is exactly "started their journey at buff goat".
  // Their bar therefore sits at 0% until real volume passes buff's
  // threshold — correct, if worth knowing.
  const minIndex = Math.max(0, Math.min(EVOLUTION_TIERS.length - 1, minStage - 1));
  const effectiveVolume = Math.max(volume, thresholdAt(minIndex));

  let baseIndex = 0;
  for (let i = 0; i < EVOLUTION_TIERS.length; i += 1) {
    if (effectiveVolume >= thresholdAt(i)) baseIndex = i;
  }

  // Drop one tier (floored at 0) when neglected. Capped at one regardless
  // of how long it's been — 5 days and 5 weeks demote the same single step.
  //
  // The floor wins over the penalty: a demotion must never take an account
  // below the stage it started at, or a lapsed trainer would appear as the
  // base goat they were never meant to be. Consequence worth naming: a
  // trainer under titan cannot visibly be demoted at all.
  const neglected = isTierNeglected(lastWorkoutAt) && baseIndex > minIndex;
  const currentIndex = Math.max(minIndex, neglected ? baseIndex - 1 : baseIndex);

  const current = scaledTier(currentIndex, factor);
  const baseTier = scaledTier(baseIndex, factor);
  const next = currentIndex + 1 < EVOLUTION_TIERS.length ? scaledTier(currentIndex + 1, factor) : null;

  if (!next) {
    return { current, next: null, percent: 100, isMaxTier: true, neglected, baseTier, scale: factor };
  }

  const span = next.threshold - current.threshold;
  const progressInSpan = effectiveVolume - current.threshold;
  const percent = Math.min(100, Math.max(0, (progressInSpan / span) * 100));

  return { current, next, percent, isMaxTier: false, neglected, baseTier, scale: factor };
}

// ---- UI-only: relative points shown as personalised absolute kg --------
// Everything above (thresholds, lifetimeVolume, percent, which tier you're
// in) is Relative Strength Volume POINTS — deliberately body-weight-fair.
// The screens still frame those goals as huge kg numbers for the gym-bro
// dopamine hit: a point is "lift your own body weight once", so points ×
// body weight ≈ the tonnage that earned it. Purely a display transform —
// never feed the result back into getEvolutionProgress or a percentage.
//
// 75 kg fallback when no weigh-in is on file yet — the same constant the
// server (functions/storeCatalog.js) and workoutStats.js use to map
// pre-relative history onto the new scale, so the number a brand-new user
// sees lines up with what their first logged weight will produce.
export const DISPLAY_FALLBACK_BODYWEIGHT_KG = 75;

export function pointsToDisplayKg(points, bodyWeightKg) {
  const bw = Number(bodyWeightKg) > 0 ? Number(bodyWeightKg) : DISPLAY_FALLBACK_BODYWEIGHT_KG;
  return Math.round(Number(points) * bw);
}

export function formatTierGoalKg(points, bodyWeightKg) {
  return `${pointsToDisplayKg(points, bodyWeightKg).toLocaleString('en-US')} kg`;
}
