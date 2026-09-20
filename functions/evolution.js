// Jimmy's evolution ladder, server side.
//
// A deliberate CommonJS twin of src/utils/evolutionTiers.js — the same
// arrangement storeCatalog.js has with src/data/**. The client cannot be
// the authority on when an account evolves, because crossing a threshold
// now writes a notification into other people's inboxes, and nothing a
// user can edit gets to decide what their friends are told about them.
//
// TWIN TABLE. These thresholds — and FEMALE_PROGRESSION_SCALE and the
// rule in progressionScaleFor — MUST match EVOLUTION_TIERS,
// FEMALE_PROGRESSION_SCALE and progressionScale in
// src/utils/evolutionTiers.js exactly. Changing one without the other puts
// "Titan Goat" on someone's own screen while their friends are told they
// reached something else — the kind of disagreement nobody can debug from
// either side alone.
// Every tier's emoji is the goat itself — that is what the client's table
// says, and this one is a copy, not an improvement on it. The notification
// picks its own decoration at the call site rather than inventing a
// per-tier emoji here that the app's own screens would contradict.
const { MASCOT_GENA, resolveMascotId } = require('./mascots');

const EVOLUTION_TIERS = [
  { id: 'goat', label: 'Goat', threshold: 0, emoji: '🐐', stage: 1 },
  { id: 'buff', label: 'Buff Goat', threshold: 400, emoji: '🐐', stage: 2 },
  { id: 'titan', label: 'Titan Goat', threshold: 2_000, emoji: '🐐', stage: 3 },
  { id: 'legend', label: 'Legendary G.O.A.T.', threshold: 5_000, emoji: '🐐', stage: 4 },
];

// A female account climbs the same ladder with every threshold at this
// fraction of the table — src/utils/evolutionTiers.js's header (THE
// FEMALE SCALE) has the reasoning. The score itself is never scaled.
const FEMALE_PROGRESSION_SCALE = 0.65;

// The threshold scale for an account, from its users/{uid} doc: THE
// LADDER FOLLOWS THE CHARACTER. Whoever resolves to Gena — an explicit
// `mascot`, else a 'female' onboarding answer (mascots.js's resolver, the
// same precedence the sprite uses) — climbs the female ladder; whoever
// resolves to Jimmy climbs the base one. One rule for the avatar, the
// thresholds, the coins and the badge tree, which is what lets a mascot
// swap (adminUserActions.js, or Settings) move all four together.
// Decided here so logWorkout, the admin analytics and the admin tooling
// cannot disagree about whose ladder is whose.
function progressionScaleFor(userData) {
  return resolveMascotId(userData) === MASCOT_GENA ? FEMALE_PROGRESSION_SCALE : 1;
}

// The coin side of the same rule. A workout pays per relative point
// (storeCatalog.js's COINS_PER_RELATIVE_POINT), and a female session is
// worth ~0.65 of a male one in those points, so it paid ~0.65 of the
// coins for the same relative effort. The payout is multiplied by the
// inverse — 1 / 0.65 ≈ 1.54 — so the equivalent session walks away with
// the equivalent purse. The multiplier is applied to the coins alone
// (economy.js's coinsFor); the score, the tonnage and the records are
// never touched, same as the thresholds.
const FEMALE_COIN_MULTIPLIER = 1 / FEMALE_PROGRESSION_SCALE;

function coinMultiplierFor(userData) {
  return 1 / progressionScaleFor(userData);
}

// A scale is a fraction of the table in (0, 1]; anything else is 1.
function normaliseScale(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 1;
}

// The tier a given cumulative Relative Strength Volume has earned, on the
// ladder `scale` puts the thresholds on (progressionScaleFor).
//
// `minStage` is the floor a coach's goat is drawn from (2 — see
// economy.js's published `minStage` and src/utils/evolutionTiers.js). It
// is applied here rather than by the caller so that a trainer sitting at
// zero volume is never announced as having "evolved" into the stage their
// account has been drawn at since the day it was created.
function tierForVolume(volume, { minStage = 1, scale = 1 } = {}) {
  const value = Number(volume);
  const v = Number.isFinite(value) ? value : 0;
  const factor = normaliseScale(scale);
  let tier = EVOLUTION_TIERS[0];
  for (const candidate of EVOLUTION_TIERS) {
    if (v >= candidate.threshold * factor) tier = candidate;
  }
  if (tier.stage < minStage) {
    return EVOLUTION_TIERS.find((t) => t.stage === minStage) ?? tier;
  }
  return tier;
}

// The tier crossed by going from `before` to `after`, or null if none was.
//
// Strictly an UPGRADE check. Volume only ever grows (a recovery workout
// adds nothing rather than subtracting), but comparing stages rather than
// volumes means a threshold edit that moves someone down can never fire a
// celebration, and a re-run of the same workout can never fire twice.
function evolutionCrossed(before, after, options) {
  const from = tierForVolume(before, options);
  const to = tierForVolume(after, options);
  return to.stage > from.stage ? { from, to } : null;
}

module.exports = {
  EVOLUTION_TIERS,
  FEMALE_PROGRESSION_SCALE,
  FEMALE_COIN_MULTIPLIER,
  progressionScaleFor,
  coinMultiplierFor,
  tierForVolume,
  evolutionCrossed,
};
