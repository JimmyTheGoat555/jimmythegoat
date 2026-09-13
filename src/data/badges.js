// Achievement badge catalog — the DISPLAY side. The award logic lives
// server-side in functions/badges.js (a deliberate ESM/CJS duplicate, same
// as records.js ↔ personalRecords.js): that file re-derives which ids a
// user has earned from their stored aggregate on every logWorkout, so a
// badge can never be self-granted by a client. If you add, rename or
// re-threshold a badge here, change functions/badges.js to match.
//
// Storage: users/{uid}.badges is an array of { id, at } (at = ISO award
// time), written only by the Admin SDK. See firestore.rules —
// `badges` is in serverManagedFieldsUnchanged().
//
// SHAPE: categories, each with tiers.
//
// Ten lifting categories, three tiers each, plus three single-tier
// originals. The shelf renders one slot per CATEGORY showing the best
// tier reached — thirty tiles would be a wall, and "what have I got on
// bench" is the question a trophy case should answer at a glance.
//
// WHY THE GOLD IDS LOOK OLD: they are. Every gold threshold here is the
// flat threshold this app already shipped, so `bench-100kg` and friends
// keep their exact meaning and every badge already sitting in a real
// user's array stays valid. Bronze and silver are the only new ids.
// Renaming the golds would have meant a migration for nothing.

export const TIER_STYLE = {
  bronze: { label: 'Bronze', color: '#CD7F32', glow: 'rgba(205,127,50,0.55)' },
  silver: { label: 'Silver', color: '#C0C0C0', glow: 'rgba(192,192,192,0.55)' },
  gold: { label: 'Gold', color: '#FFD700', glow: 'rgba(255,215,0,0.6)' },
};

// `metric` is what the number MEANS, so the shelf can say "Bench Press —
// Silver · 80 kg" without each tier repeating the noun.
export const BADGE_CATEGORIES = [
  {
    id: 'bench_absolute',
    name: 'Bench Press',
    icon: '🏋️',
    blurb: 'Flat barbell bench, all the way down and back up.',
    tiers: [
      { id: 'bench-60kg', tier: 'bronze', label: '60 kg' },
      { id: 'bench-80kg', tier: 'silver', label: '80 kg' },
      { id: 'bench-100kg', tier: 'gold', label: '100 kg' },
    ],
  },
  {
    id: 'bench_relative',
    name: 'Relative Bench',
    icon: '⚖️',
    blurb: 'Bench measured against what you carry around all day.',
    tiers: [
      { id: 'bench-half-bw', tier: 'bronze', label: '0.5× bodyweight' },
      { id: 'bench-075-bw', tier: 'silver', label: '0.75× bodyweight' },
      { id: 'bench-bodyweight', tier: 'gold', label: '1× bodyweight' },
    ],
  },
  {
    id: 'squat_absolute',
    name: 'Squat',
    icon: '🦵',
    blurb: 'Under the bar and back up. Nobody gets this by accident.',
    tiers: [
      { id: 'squat-80kg', tier: 'bronze', label: '80 kg' },
      { id: 'squat-110kg', tier: 'silver', label: '110 kg' },
      { id: 'squat-140kg', tier: 'gold', label: '140 kg' },
    ],
  },
  {
    id: 'deadlift_absolute',
    name: 'Deadlift',
    icon: '🪨',
    blurb: 'Off the floor, locked out, put down under control.',
    tiers: [
      { id: 'deadlift-100kg', tier: 'bronze', label: '100 kg' },
      { id: 'deadlift-140kg', tier: 'silver', label: '140 kg' },
      { id: 'deadlift-200kg', tier: 'gold', label: '200 kg' },
    ],
  },
  {
    id: 'deadlift_relative',
    name: 'Relative Deadlift',
    icon: '🧲',
    blurb: 'Multiples of your own body weight, off the floor.',
    tiers: [
      { id: 'deadlift-1x-bw', tier: 'bronze', label: '1× bodyweight' },
      { id: 'deadlift-15x-bw', tier: 'silver', label: '1.5× bodyweight' },
      { id: 'deadlift-2x-bw', tier: 'gold', label: '2× bodyweight' },
    ],
  },
  {
    id: 'overhead_press',
    name: 'Overhead Press',
    icon: '🙌',
    blurb: 'Straight overhead, no leg drive to hide behind.',
    tiers: [
      { id: 'ohp-40kg', tier: 'bronze', label: '40 kg' },
      { id: 'ohp-50kg', tier: 'silver', label: '50 kg' },
      { id: 'ohp-60kg', tier: 'gold', label: '60 kg' },
    ],
  },
  {
    id: 'db_press',
    name: 'Dumbbell Press',
    icon: '💪',
    blurb: 'Two of them. Getting into position is half the lift.',
    tiers: [
      { id: 'db-press-20kg', tier: 'bronze', label: '20 kg' },
      { id: 'db-press-30kg', tier: 'silver', label: '30 kg' },
      { id: 'db-press-40kg', tier: 'gold', label: '40 kg' },
    ],
  },
  {
    id: 'weighted_pullup',
    name: 'Weighted Pull-Up',
    icon: '🔗',
    blurb: 'Your body was not heavy enough, apparently.',
    tiers: [
      { id: 'pullup-5kg', tier: 'bronze', label: '+5 kg' },
      { id: 'pullup-10kg', tier: 'silver', label: '+10 kg' },
      { id: 'pullup-20kg', tier: 'gold', label: '+20 kg' },
    ],
  },
  {
    id: 'power_total',
    name: 'Power Total',
    icon: '🏆',
    blurb: 'Squat, bench and deadlift added together.',
    tiers: [
      { id: 'total-200kg', tier: 'bronze', label: '200 kg total' },
      { id: 'total-350kg', tier: 'silver', label: '350 kg total' },
      { id: 'total-500kg', tier: 'gold', label: '500 kg total' },
    ],
  },
  {
    id: 'daily_volume',
    name: 'Session Volume',
    icon: '🚛',
    blurb: 'Everything moved between one warm-up and one shower.',
    tiers: [
      { id: 'volume-3t', tier: 'bronze', label: '3,000 kg in a session' },
      { id: 'volume-6t', tier: 'silver', label: '6,000 kg in a session' },
      { id: 'ten-ton-titan', tier: 'gold', label: '10,000 kg in a session' },
    ],
  },

  // ── Single-tier originals ────────────────────────────────────────────
  // Not lifting milestones and not tiered, kept because these ids are
  // already in real users' arrays — dropping one from the registry would
  // leave an awarded entry pointing at nothing. They render as one-tier
  // categories, which is why `tiers` is still an array here.
  {
    id: 'consistency',
    name: '50 Workouts',
    icon: '📅',
    blurb: 'Fifty sessions in the book. Consistency compounds.',
    tiers: [{ id: 'workouts-50', tier: 'gold', label: '50 workouts logged' }],
  },
  {
    id: 'streak',
    name: 'Streak Master',
    icon: '🔥',
    blurb: 'Seven days straight. No zero days.',
    tiers: [{ id: 'streak-7', tier: 'gold', label: '7 days in a row' }],
  },
  {
    id: 'relative_titan',
    name: 'Relative Titan',
    icon: '⚡',
    blurb: 'Pound-for-pound freak. Jimmy is impressed, and Jimmy is never impressed.',
    tiers: [{ id: 'relative-titan', tier: 'gold', label: '2.0+ relative score in one set' }],
  },
];

// Flat view: every tier as its own record, with its category folded in.
// This is what anything keyed by badge ID reads — the celebration modal,
// the friend-profile allowlist — so those did not have to learn about
// categories to keep working.
export const BADGES = BADGE_CATEGORIES.flatMap((category) =>
  category.tiers.map((t) => ({
    id: t.id,
    tier: t.tier,
    // "Bench Press · Gold" rather than a bespoke name per tier: thirty
    // invented names would be thirty things to keep straight, and the
    // category plus the metal already says exactly what was earned.
    name: category.tiers.length > 1 ? `${category.name} · ${TIER_STYLE[t.tier].label}` : category.name,
    icon: category.icon,
    blurb: category.blurb,
    requirement: t.label,
    categoryId: category.id,
    categoryName: category.name,
  })),
);

const BY_ID = new Map(BADGES.map((b) => [b.id, b]));

export function getBadge(id) {
  return BY_ID.get(id) ?? null;
}

// Normalises users/{uid}.badges (array of { id, at }, or a bare string in
// case an older shape ever shows up) into a Map id -> awardedAt ISO string.
export function earnedBadgeMap(badges) {
  const map = new Map();
  for (const entry of Array.isArray(badges) ? badges : []) {
    if (typeof entry === 'string') map.set(entry, null);
    else if (entry && typeof entry.id === 'string') map.set(entry.id, entry.at ?? null);
  }
  return map;
}

// The best tier reached in a category, or null. Tiers are listed
// bronze→gold, so the LAST earned one wins — which also means a user who
// somehow holds gold without silver (thresholds changed under them, say)
// still shows gold rather than a gap.
export function highestEarnedTier(category, earned) {
  let best = null;
  for (const t of category.tiers) if (earned.has(t.id)) best = t;
  return best;
}

// The tier a category is working toward — the first not yet earned. Null
// once the category is complete.
export function nextTier(category, earned) {
  return category.tiers.find((t) => !earned.has(t.id)) ?? null;
}
