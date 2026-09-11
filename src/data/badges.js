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
  {
    id: 'bench-100kg',
    name: '100kg Bench Club',
    icon: '🏋️',
    blurb: 'Three plates a side. Welcome to the club.',
    requirement: 'Log a Barbell Bench Press set of 100 kg or more',
  },
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
