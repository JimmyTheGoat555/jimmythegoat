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
// SHAPE: two trees of categories, each with tiers.
//
// ACHIEVEMENTS.jimmy is the ten lifting categories this app shipped
// with plus a lifetime-tonnage ladder; ACHIEVEMENTS.gena is a tree built
// around a female lifter's training — glutes and lower body, core, the
// first unassisted pull-up, push-ups, and tonnage ladders at 0.65 of
// Jimmy's, the same ratio the evolution thresholds and the coin rate use
// (utils/evolutionTiers.js). Three consistency badges are in both. The
// server awards from the tree of the character the account wears
// (functions/badges.js), and the picker lists the wearer's own tree
// first (achievementsFor); every lookup by id reads the UNION
// (BADGE_CATEGORIES), so a badge earned on either tree resolves wherever
// it is shown — an account that switches character keeps its shelf.
//
// Three tiers per category, and one slot per CATEGORY on the shelf
// showing the best tier reached — every tile at once would be a wall,
// and "what have I got on bench" is the question a trophy case should
// answer at a glance.
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
const JIMMY_CATEGORIES = [
  {
    id: 'bench_absolute',
    // Plain language for the detail sheet: what you actually DID.
    how: 'Bench pressed %s',
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
    // Plain language for the detail sheet: what you actually DID.
    how: 'Bench pressed %s',
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
    // Plain language for the detail sheet: what you actually DID.
    how: 'Squatted %s',
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
    // Plain language for the detail sheet: what you actually DID.
    how: 'Deadlifted %s',
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
    // Plain language for the detail sheet: what you actually DID.
    how: 'Deadlifted %s',
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
    // Plain language for the detail sheet: what you actually DID.
    how: 'Pressed %s straight overhead',
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
    // Plain language for the detail sheet: what you actually DID.
    how: 'Pressed %s dumbbells',
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
    // Plain language for the detail sheet: what you actually DID.
    how: 'Pulled up with %s strapped on',
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
    // Plain language for the detail sheet: what you actually DID.
    how: 'Bench, squat and deadlift adding to %s',
    name: 'Power Total',
    icon: '🏆',
    blurb: 'Squat, bench and deadlift added together.',
    tiers: [
      { id: 'total-200kg', tier: 'bronze', label: '200 kg' },
      { id: 'total-350kg', tier: 'silver', label: '350 kg' },
      { id: 'total-500kg', tier: 'gold', label: '500 kg' },
    ],
  },
  {
    id: 'daily_volume',
    // Plain language for the detail sheet: what you actually DID.
    how: 'Moved %s',
    name: 'Session Volume',
    icon: '🚛',
    blurb: 'Everything moved between one warm-up and one shower.',
    tiers: [
      { id: 'volume-3t', tier: 'bronze', label: '3,000 kg in a session' },
      { id: 'volume-6t', tier: 'silver', label: '6,000 kg in a session' },
      { id: 'ten-ton-titan', tier: 'gold', label: '10,000 kg in a session' },
    ],
  },
  {
    id: 'lifetime_volume_jimmy',
    how: 'Moved %s, all time',
    name: 'Volume King',
    icon: '👑',
    blurb: 'Every kilogram you have ever moved, added up.',
    tiers: [
      { id: 'volume-king-10t', tier: 'bronze', label: '10,000 kg lifetime' },
      { id: 'volume-king-50t', tier: 'silver', label: '50,000 kg lifetime' },
      { id: 'volume-king-100t', tier: 'gold', label: '100,000 kg lifetime' },
    ],
  },
];

// ── Gena's tree ──────────────────────────────────────────────────────
// Where the brief named one number it is the entry tier, with two rungs
// above it to keep chasing; Squat Queen puts the named 1× bodyweight at
// gold instead — a big day for a female lifter, and the same 0.5 / 0.75
// / 1 shape as the relative bench ladder above. Thresholds live in
// functions/badges.js's GENA_LADDERS; these labels must say the same.
const GENA_CATEGORIES = [
  {
    id: 'peach_builder',
    how: 'Logged %s of hip thrusts and glute bridges',
    name: 'Peach Builder',
    icon: '🍑',
    blurb: 'Hip thrusts and glute bridges, counted for life. The sets add up.',
    tiers: [
      { id: 'peach-builder-10', tier: 'bronze', label: '10 sets' },
      { id: 'peach-builder-50', tier: 'silver', label: '50 sets' },
      { id: 'peach-builder-150', tier: 'gold', label: '150 sets' },
    ],
  },
  {
    id: 'squat_queen',
    how: 'Squatted %s',
    name: 'Squat Queen',
    icon: '👑',
    blurb: 'Your squat against what you weigh. Your own bodyweight on the bar is the crown.',
    tiers: [
      { id: 'squat-queen-half-bw', tier: 'bronze', label: '0.5× bodyweight' },
      { id: 'squat-queen-075-bw', tier: 'silver', label: '0.75× bodyweight' },
      { id: 'squat-queen-bw', tier: 'gold', label: '1× bodyweight' },
    ],
  },
  {
    id: 'leg_day',
    how: 'Finished a session that was %s',
    name: 'Leg Day Survivor',
    icon: '🦵',
    blurb: 'A session where the legs did nearly all the work. Stairs tomorrow are your problem.',
    tiers: [
      { id: 'leg-day-75', tier: 'bronze', label: '75% lower body' },
      { id: 'leg-day-85', tier: 'silver', label: '85% lower body' },
      { id: 'leg-day-95', tier: 'gold', label: '95% lower body' },
    ],
  },
  {
    id: 'core_steel',
    how: 'Trained core in %s',
    name: 'Core of Steel',
    icon: '🛡️',
    blurb: 'Core work in every session, session after session. No skipped abs.',
    tiers: [
      { id: 'core-steel-3', tier: 'bronze', label: '3 workouts in a row' },
      { id: 'core-steel-7', tier: 'silver', label: '7 workouts in a row' },
      { id: 'core-steel-14', tier: 'gold', label: '14 workouts in a row' },
    ],
  },
  {
    id: 'first_pullup',
    how: 'Did %s',
    name: 'First Pull-Up',
    icon: '🔝',
    blurb: 'Chin over the bar under your own power. One of the biggest days a lifter gets.',
    tiers: [{ id: 'first-pullup', tier: 'gold', label: 'your first unassisted pull-up' }],
  },
  {
    id: 'pushup_warrior',
    how: 'Did %s',
    name: 'Push-Up Warrior',
    icon: '⚔️',
    blurb: 'Full push-ups, chest to the floor, in one unbroken set.',
    tiers: [
      { id: 'pushup-10', tier: 'bronze', label: '10 push-ups in a set' },
      { id: 'pushup-20', tier: 'silver', label: '20 push-ups in a set' },
      { id: 'pushup-30', tier: 'gold', label: '30 push-ups in a set' },
    ],
  },
  {
    id: 'lifetime_volume_gena',
    how: 'Moved %s, all time',
    name: 'Volume Queen',
    icon: '👸',
    blurb: 'Every kilogram you have ever moved, added up.',
    tiers: [
      { id: 'volume-queen-6t', tier: 'bronze', label: '6,500 kg lifetime' },
      { id: 'volume-queen-32t', tier: 'silver', label: '32,500 kg lifetime' },
      { id: 'volume-queen-65t', tier: 'gold', label: '65,000 kg lifetime' },
    ],
  },
];

// ── Both trees ───────────────────────────────────────────────────────
const SHARED_CATEGORIES = [
  // ── Single-tier originals ────────────────────────────────────────────
  // Not lifting milestones and not tiered, kept because these ids are
  // already in real users' arrays — dropping one from the registry would
  // leave an awarded entry pointing at nothing. They render as one-tier
  // categories, which is why `tiers` is still an array here.
  {
    id: 'consistency',
    // Plain language for the detail sheet: what you actually DID.
    how: 'Logged %s',
    name: '50 Workouts',
    icon: '📅',
    blurb: 'Fifty sessions in the book. Consistency compounds.',
    tiers: [{ id: 'workouts-50', tier: 'gold', label: '50 workouts' }],
  },
  {
    id: 'streak',
    // Plain language for the detail sheet: what you actually DID.
    how: 'Trained %s',
    name: 'Streak Master',
    icon: '🔥',
    blurb: 'Seven days straight. No zero days.',
    tiers: [{ id: 'streak-7', tier: 'gold', label: '7 days in a row' }],
  },
  {
    id: 'relative_titan',
    // Plain language for the detail sheet: what you actually DID.
    how: 'Hit %s',
    name: 'Relative Titan',
    icon: '⚡',
    blurb: 'Pound-for-pound freak. Jimmy is impressed, and Jimmy is never impressed.',
    tiers: [{ id: 'relative-titan', tier: 'gold', label: '2.0+ relative score in one set' }],
  },
];

// The two trees, keyed by mascot id (data/mascots.js), each ending in the
// shared three; and the union, which every lookup by id reads.
export const ACHIEVEMENTS = {
  jimmy: [...JIMMY_CATEGORIES, ...SHARED_CATEGORIES],
  gena: [...GENA_CATEGORIES, ...SHARED_CATEGORIES],
};
export const BADGE_CATEGORIES = [...JIMMY_CATEGORIES, ...GENA_CATEGORIES, ...SHARED_CATEGORIES];

// The tree an account earns from. Unknown or missing falls to Jimmy's,
// the same way resolveMascotId falls to Jimmy.
export function achievementsFor(mascotId) {
  return ACHIEVEMENTS[mascotId] ?? ACHIEVEMENTS.jimmy;
}

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
    // "Bench pressed 100 kg" — the threshold folded into the verb, so
    // the detail sheet reads as a sentence instead of a spec line.
    howEarned: (category.how ?? '%s').replace('%s', t.label),
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

// ── Featured badges ──────────────────────────────────────────────────
//
// A profile shows at most three, and the owner picks which. Locked
// badges are never rendered anywhere any more: the catalog is not a
// to-do list on display, it is a surprise, and a grid of silhouettes
// naming every threshold gives that away.

export const MAX_FEATURED_BADGES = 3;

// gold > silver > bronze, used for the automatic default and for
// ordering the picker.
const TIER_RANK = { gold: 3, silver: 2, bronze: 1 };

// Gold first, then silver, then bronze — the one definition of that
// ordering, shared by every surface that shows more than one badge at
// once (the picker's list, the profile ribbon's default, and the
// post-workout celebration). Ties keep the caller's order, since
// Array.prototype.sort is stable: clearing three tiers of one lift in a
// single session should still read bench-then-squat, not shuffled.
export function byTierDesc(a, b) {
  return (TIER_RANK[b?.tier] ?? 0) - (TIER_RANK[a?.tier] ?? 0);
}

// Collapse a list of badge ids to ONE per category — the best tier in
// each. Clearing three rungs of the bench ladder in a single session is
// one achievement with a history, not three trophies, and showing the
// bronze and silver next to the gold makes the gold look smaller than it
// is.
//
// Display only. The server still awards every rung it cleared (see
// functions/badges.js's cumulative awardLadder), and it should: the
// lower ids are what make the ladder re-derivable, and dropping them
// would leave a user who later has a threshold moved under them holding
// gold with nothing beneath it. What changes here is only what gets shown
// at once.
export function bestOfEachCategory(ids) {
  const best = new Map();
  for (const id of Array.isArray(ids) ? ids : []) {
    const badge = getBadge(id);
    if (!badge) continue;
    const held = best.get(badge.categoryId);
    if (!held || (TIER_RANK[badge.tier] ?? 0) > (TIER_RANK[held.tier] ?? 0)) {
      best.set(badge.categoryId, badge);
    }
  }
  return [...best.values()].sort(byTierDesc);
}

// One entry per category the user has ANY tier in, holding their best.
// The picker offers these rather than every id: "Bench Press · Bronze"
// is not a thing to choose when you already hold gold in that category.
// With a `mascotId` the wearer's own tree comes first and anything held
// from the other tree follows — shown, never dropped.
export function earnedCategoryBests(earned, mascotId = null) {
  const own = mascotId ? achievementsFor(mascotId) : BADGE_CATEGORIES;
  const rest = BADGE_CATEGORIES.filter((category) => !own.includes(category));
  return [...own, ...rest]
    .map((category) => highestEarnedTier(category, earned))
    .filter(Boolean)
    .map((t) => getBadge(t.id))
    .filter(Boolean)
    .sort(byTierDesc);
}

// What to show when the user has never chosen: their best three, gold
// first. Also the filter for a stored choice — an id that is no longer
// earned (or never was) is dropped rather than rendered as a blank.
export function resolveFeaturedBadges(badges, featured) {
  const earned = earnedBadgeMap(badges);
  const bests = earnedCategoryBests(earned);
  const bestByCategory = new Map(bests.map((b) => [b.categoryId, b]));

  // A stored id is resolved to the best tier of ITS CATEGORY rather than
  // rendered literally, which does three things at once:
  //
  //   * two rungs of the same lift collapse to one — nobody wants a
  //     profile showing Bench Press bronze AND silver;
  //   * a pick made before you got stronger upgrades itself, so the badge
  //     you chose to show becomes gold the day you earn gold instead of
  //     silently vanishing from your profile;
  //   * an id for a category you hold nothing in disappears, which is the
  //     only case where dropping it is the right answer.
  const chosen = [];
  const seen = new Set();
  for (const id of Array.isArray(featured) ? featured : []) {
    const best = bestByCategory.get(getBadge(id)?.categoryId);
    if (!best || seen.has(best.categoryId)) continue;
    seen.add(best.categoryId);
    chosen.push(best);
    if (chosen.length === MAX_FEATURED_BADGES) break;
  }

  if (chosen.length > 0) return chosen;
  return bests.slice(0, MAX_FEATURED_BADGES);
}
