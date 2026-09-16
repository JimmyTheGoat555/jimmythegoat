// Bar types for the barbell calculator. `weight` is the empty bar in kg.
//
// Ids, not weights, are what the UI remembers — a gym that swaps its EZ
// bar for a heavier one only needs the number here to change, and every
// set that named 'ez' keeps meaning "the EZ bar" rather than "10". The
// weight is still stored ON the set as `barWeight`, so an old set always
// re-opens with the bar it was actually logged with even if this list
// later changes.
export const BAR_TYPES = [
  { id: 'olympic', label: 'Olympic', weight: 20 },
  { id: 'womens', label: "Women's", weight: 15 },
  { id: 'smith', label: 'Smith', weight: 15 },
  { id: 'ez', label: 'EZ Bar', weight: 10 },
  { id: 'trap', label: 'Trap Bar', weight: 25 },
  { id: 'none', label: 'No Bar', weight: 0 },
];

export const DEFAULT_BAR_ID = 'olympic';

// Plate increments, per side. These are the plates actually racked in a
// metric gym — 25s exist but are rare enough outside a powerlifting room
// that a sixth button costs more (a cramped row on a 375px screen) than
// it saves, and two taps of +10 gets there.
export const PLATE_STEPS_KG = [1.25, 2.5, 5, 10, 20];

export function getBarType(id) {
  return BAR_TYPES.find((b) => b.id === id) ?? BAR_TYPES.find((b) => b.id === DEFAULT_BAR_ID);
}

// Reverse lookup for a set logged before bar IDs existed, or one whose bar
// has since been re-weighted: match on the stored number so the selector
// still highlights something sensible instead of silently resetting to
// Olympic and changing the total.
export function barIdForWeight(weight) {
  const match = BAR_TYPES.find((b) => b.weight === Number(weight));
  return match?.id ?? null;
}
