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
