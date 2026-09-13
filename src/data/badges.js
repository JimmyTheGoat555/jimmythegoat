// Achievement badge catalog — the DISPLAY side. The award logic lives
// server-side in functions/badges.js (a deliberate ESM/CJS duplicate, same
// as records.js ↔ personalRecords.js): that file re-derives which ids a
// user has earned from their stored history on every logWorkout, so a
// badge can never be self-granted by a client. If you add or rename a
// badge id here, change functions/badges.js to match.
//
// Storage: users/{uid}.badges is an array of { id, at } (at = ISO award
// time), written only by the Admin SDK. See firestore.rules —
// `badges` is in serverManagedFieldsUnchanged().

export const BADGES = [
  // ── The heavy-lifting milestones ─────────────────────────────────────
  // Order is roughly "first one most people get" to "last" — the shelf
  // renders this array as-is, so it doubles as the progression a locked
  // grid reads top-to-bottom.
  {
    id: 'bench-bodyweight',
    name: 'Bodyweight Bench',
    icon: '⚖️',
    blurb: 'You can press what you carry around all day.',
    requirement: 'Bench your own body weight for a single',
  },
  {
    id: 'bench-100kg',
    name: '100kg Bench Club',
    icon: '🏋️',
    blurb: 'Three plates a side. Welcome to the club.',
    requirement: 'Log a Barbell Bench Press set of 100 kg or more',
  },
  {
    id: 'ohp-60kg',
    name: '60kg Overhead',
    icon: '🙌',
    blurb: 'Straight overhead, no leg drive to hide behind.',
    requirement: 'Overhead Press 60 kg or more',
  },
  {
    id: 'db-press-40kg',
    name: '40kg Dumbbells',
    icon: '💪',
    blurb: 'Two of them. Getting them into position is half the lift.',
    requirement: 'Incline Dumbbell Press 40 kg or more',
  },
  {
    id: 'squat-140kg',
    name: '140kg Squat',
    icon: '🦵',
    blurb: 'Under the bar and back up. No one gets this by accident.',
    requirement: 'Squat 140 kg or more',
  },
  {
    id: 'pullup-20kg',
    name: '+20kg Pull-Up',
    icon: '🔗',
    blurb: 'Your body was not heavy enough, apparently.',
    requirement: 'Pull-Up with 20 kg or more of added weight',
  },
  {
    id: 'deadlift-2x-bw',
    name: 'Double Bodyweight Pull',
    icon: '🧲',
    blurb: 'Twice what you weigh, off the floor.',
    requirement: 'Deadlift 2× your body weight',
  },
  {
    id: 'deadlift-200kg',
    name: '200kg Deadlift',
    icon: '🪨',
    blurb: 'Four plates. The bar bends and you keep going.',
    requirement: 'Deadlift 200 kg or more',
  },
  {
    id: 'total-500kg',
    name: 'The 500kg Club',
    icon: '🏆',
    blurb: 'Bench, squat and deadlift adding to half a tonne.',
    requirement: 'Best Bench + Squat + Deadlift totalling 500 kg',
  },
  {
    id: 'ten-ton-titan',
    name: '10-Ton Titan',
    icon: '🚛',
    blurb: 'Ten thousand kilos moved between one warm-up and one shower.',
    requirement: 'Move 10,000 kg of total volume in a single workout',
  },

  // ── The originals ────────────────────────────────────────────────────
  // Not lifting milestones, and kept anyway: these ids are already sitting
  // in real users' `badges` arrays, and dropping one from the registry
  // would leave an awarded entry pointing at nothing.
  {
    id: 'workouts-50',
    name: '50 Workouts Logged',
    icon: '📅',
    blurb: 'Fifty sessions in the book. Consistency compounds.',
    requirement: 'Finish 50 workouts',
  },
  {
    id: 'streak-7',
    name: 'Streak Master',
    icon: '🔥',
    blurb: 'Seven days straight. No zero days.',
    requirement: 'Work out 7 calendar days in a row',
  },
  {
    id: 'relative-titan',
    name: 'Relative Titan',
    icon: '⚡',
    blurb: 'Pound-for-pound freak. Jimmy is impressed, and Jimmy is never impressed.',
    requirement: 'Hit a 2.0+ relative-strength score in one set (≈ 2× body weight for a single)',
  },
];

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
