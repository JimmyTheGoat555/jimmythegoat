// When a workout streak starts showing.
//
// Lives in utils, not in the context that first needed it, for two
// reasons: a constant exported from a .jsx file alongside components
// breaks Vite's Fast Refresh for that file, and the dependency ran the
// wrong way — utils/friendPrivacy.js was importing from context/, which
// inverts the layering every other file here follows.
//
// One workout is just a workout. Two inside the window is the interesting
// state — they came back — so that is where Jimmy catches light. The
// server-side window that decides whether the run survives at all is
// STREAK_GAP_MS in functions/economy.js; this is only the display
// threshold, and the two are deliberately separate numbers.
export const FIRE_STREAK_MIN = 2;

// Whether a streak value — from anywhere: your own account doc, a
// friend's public summary, a feed post — is hot enough to burn. A
// function rather than four `>= FIRE_STREAK_MIN` comparisons scattered
// across call sites, so the coercion of a missing/garbage value is
// decided once.
export function isOnFire(streak) {
  return (Number(streak) || 0) >= FIRE_STREAK_MIN;
}

// ── Streak tiers ────────────────────────────────────────────────────────
//
// The aura gets louder the longer the run, so the fire is a ladder to
// climb rather than a binary that stops meaning anything on day three.
//
//   1  Warm Fire  (2-4)   orange/yellow, a slow breath
//   2  Hot Flame  (5-9)   red/magenta, faster and brighter
//   3  Legendary  (10+)   gold with a blue-flame core, and a slow rotation
//
// Thresholds live here with isOnFire rather than in the avatar, for the
// same reason that one does: every surface that draws a streak — the feed,
// the leaderboard, a friend's profile, your own goat — has to agree, and a
// component that renders a goat should not be where "how long is a long
// streak" is decided.
export const STREAK_TIERS = [
  { tier: 1, min: 2, label: 'Warm Fire' },
  { tier: 2, min: 5, label: 'Hot Flame' },
  { tier: 3, min: 10, label: 'Legendary' },
];

// 0 when the streak is too short to show at all — callers can treat it as
// falsy, which keeps every `showFire`-style check reading the same way it
// did when this was a boolean.
export function streakTier(streak) {
  const n = Number(streak) || 0;
  let tier = 0;
  for (const t of STREAK_TIERS) if (n >= t.min) tier = t.tier;
  return tier;
}

// The class pair for the aura: the base animation plus its tier skin.
// Empty string for no streak, so it drops straight into a template
// literal without a conditional at every call site.
export function streakAuraClass(streak) {
  const tier = streakTier(streak);
  return tier === 0 ? '' : `streak-fire streak-fire--t${tier}`;
}

export function streakTierLabel(streak) {
  return STREAK_TIERS.find((t) => t.tier === streakTier(streak))?.label ?? null;
}
