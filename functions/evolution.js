// Jimmy's evolution ladder, server side.
//
// A deliberate CommonJS twin of src/utils/evolutionTiers.js — the same
// arrangement storeCatalog.js has with src/data/**. The client cannot be
// the authority on when an account evolves, because crossing a threshold
// now writes a notification into other people's inboxes, and nothing a
// user can edit gets to decide what their friends are told about them.
//
// TWIN TABLE. These thresholds MUST match EVOLUTION_TIERS in
// src/utils/evolutionTiers.js exactly. Changing one without the other puts
// "Titan Goat" on someone's own screen while their friends are told they
// reached something else — the kind of disagreement nobody can debug from
// either side alone.
// Every tier's emoji is the goat itself — that is what the client's table
// says, and this one is a copy, not an improvement on it. The notification
// picks its own decoration at the call site rather than inventing a
// per-tier emoji here that the app's own screens would contradict.
const EVOLUTION_TIERS = [
  { id: 'goat', label: 'Goat', threshold: 0, emoji: '🐐', stage: 1 },
  { id: 'buff', label: 'Buff Goat', threshold: 400, emoji: '🐐', stage: 2 },
  { id: 'titan', label: 'Titan Goat', threshold: 2_000, emoji: '🐐', stage: 3 },
  { id: 'legend', label: 'Legendary G.O.A.T.', threshold: 5_000, emoji: '🐐', stage: 4 },
];

// The tier a given cumulative Relative Strength Volume has earned.
//
// `minStage` is the floor a coach's goat is drawn from (2 — see
// economy.js's published `minStage` and src/utils/evolutionTiers.js). It
// is applied here rather than by the caller so that a trainer sitting at
// zero volume is never announced as having "evolved" into the stage their
// account has been drawn at since the day it was created.
function tierForVolume(volume, { minStage = 1 } = {}) {
  const value = Number(volume);
  const v = Number.isFinite(value) ? value : 0;
  let tier = EVOLUTION_TIERS[0];
  for (const candidate of EVOLUTION_TIERS) {
    if (v >= candidate.threshold) tier = candidate;
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

module.exports = { EVOLUTION_TIERS, tierForVolume, evolutionCrossed };
