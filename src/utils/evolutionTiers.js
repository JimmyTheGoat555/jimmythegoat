// Jimmy's evolution tiers, gated by cumulative Relative Strength Volume —
// the sum of every set's (load ÷ body weight) × reps over all history (see
// functions/economy.js and utils/workoutStats.js's lifetimeVolume). A
// typical session is worth ~100 points, so the thresholds below land at
// roughly 4 / 20 / 50 workouts. Same "always something to chase"
// philosophy as before, just on a strength-relative scale instead of raw
// kg tonnage — a 60 kg lifter and a 100 kg lifter benching their own
// bodyweight now progress at the same rate.
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
// Pass `{ lastWorkoutAt }` (ISO string from the user's own workout
// history — see src/utils/workoutStats.js's lastWorkoutAt) to apply the
// neglect penalty: `current`/`next`/`percent`/`isMaxTier` then describe
// the demoted tier, `neglected` is true, and `baseTier` is the un-demoted
// tier the volume actually earns (so the UI can say "train to restore
// your Titan tier"). Callers rendering someone ELSE's tier (leaderboard,
// a friend's profile) simply omit it and get the raw, un-penalised
// result.
export function getEvolutionProgress(volume, { lastWorkoutAt } = {}) {
  let baseIndex = 0;
  for (let i = 0; i < EVOLUTION_TIERS.length; i += 1) {
    if (volume >= EVOLUTION_TIERS[i].threshold) baseIndex = i;
  }

  // Drop one tier (floored at 0) when neglected. Capped at one regardless
  // of how long it's been — 5 days and 5 weeks demote the same single step.
  const neglected = isTierNeglected(lastWorkoutAt) && baseIndex > 0;
  const currentIndex = neglected ? baseIndex - 1 : baseIndex;

  const current = EVOLUTION_TIERS[currentIndex];
  const baseTier = EVOLUTION_TIERS[baseIndex];
  const next = EVOLUTION_TIERS[currentIndex + 1] ?? null;

  if (!next) {
    return { current, next: null, percent: 100, isMaxTier: true, neglected, baseTier };
  }

  const span = next.threshold - current.threshold;
  const progressInSpan = volume - current.threshold;
  const percent = Math.min(100, Math.max(0, (progressInSpan / span) * 100));

  return { current, next, percent, isMaxTier: false, neglected, baseTier };
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
