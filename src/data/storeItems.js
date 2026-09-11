// Display-only copy of functions/storeCatalog.js's STORE_ITEMS — used to
// render the Shop without a round trip. The prices here are NEVER what's
// actually charged: purchaseItem() re-looks-up the cost from the server's
// own copy and ignores whatever the client sends, specifically so this
// file being out of sync (or a tampered client) can't buy anything cheap.
// Keep the two lists matching by hand when you add/change an item.
// `videoDanceNumber` (dances only) maps each item to its
// public/animations/dances/dance{N}/ folder — see utils/danceAnimations.js.
// Kept right on the item definition rather than a separate lookup table,
// so there's one place to look when adding a 5th dance.
export const STORE_ITEMS = [
  { id: 'dance-shuffle', type: 'dance', name: 'The Shuffle', emoji: '🕺', cost: 600, videoDanceNumber: 1 },
  { id: 'dance-headbang', type: 'dance', name: 'Headbanger', emoji: '🤘', cost: 800, videoDanceNumber: 2 },
  { id: 'dance-victory', type: 'dance', name: 'Victory Lap', emoji: '🏆', cost: 1100, videoDanceNumber: 3 },
  { id: 'dance-moonwalk', type: 'dance', name: 'Moonwalk', emoji: '🌙', cost: 1500, videoDanceNumber: 4 },
  { id: 'accessory-cap', type: 'accessory', name: 'Ball Cap', emoji: '🧢', cost: 150, slot: 'head', rarity: 'common' },
  { id: 'accessory-shades', type: 'accessory', name: 'Shades', emoji: '🕶️', cost: 250, slot: 'eyes', rarity: 'common' },
  { id: 'accessory-tank', type: 'accessory', name: 'White Tank', emoji: '🎽', cost: 300, slot: 'body', rarity: 'common' },
  { id: 'accessory-jeans', type: 'accessory', name: 'Ripped Jeans', emoji: '👖', cost: 400, slot: 'legs', rarity: 'rare' },
  { id: 'accessory-hoodie', type: 'accessory', name: 'Cutoff Hoodie', emoji: '🧥', cost: 450, slot: 'body', rarity: 'rare' },
  { id: 'accessory-headphones', type: 'accessory', name: 'Studio Headphones', emoji: '🎧', cost: 700, slot: 'head', rarity: 'rare' },
];

// ---- Accessory slots & rarity (the "paper doll" layer) ----
//
// One item per slot at a time: equipping a second hat replaces the first,
// which is what `equipAccessory` below enforces. Slots are also what
// JimmyAvatar positions against — see ACCESSORY_LAYOUT there for the
// coordinates, which were calibrated off the sprites rather than guessed.
//
// The order is BACK TO FRONT, and that is the only thing it means: the
// jeans paint first so a hoodie's hem falls over the waistband, and the
// shades paint last so nothing crosses the lenses. Iterating slots in this order is
// what produces the z-stack, so reordering this array restyles the whole
// paper doll — don't sort it alphabetically.
export const ACCESSORY_SLOT_ORDER = ['legs', 'body', 'neck', 'head', 'eyes'];

// Border/label colours in the shop. Deliberately the classic loot ladder
// (green → blue → gold) rather than this app's tier palette: rarity is a
// property of the ITEM and must not shift meaning when the wearer evolves.
export const RARITY_STYLES = {
  common: { label: 'Common', color: '#7ddb8a' },
  rare: { label: 'Rare', color: '#6fc3ff' },
  legendary: { label: 'Legendary', color: '#f2c14e' },
};

export function getStoreItem(id) {
  return STORE_ITEMS.find((item) => item.id === id) ?? null;
}

export function accessorySlot(id) {
  return getStoreItem(id)?.slot ?? null;
}

// Equipping is a pure function over the owned/equipped arrays so the same
// rule can be reasoned about (and tested) without a component or Firestore
// in the way. Returns a NEW array.
//
// Anything already in the incoming item's slot is dropped — that IS the
// slot restriction. Unknown ids are left alone rather than silently
// discarded, so a future catalog addition can't wipe someone's loadout
// just because this build doesn't know about it yet.
export function equipAccessory(equipped, itemId) {
  const slot = accessorySlot(itemId);
  const kept = (equipped ?? []).filter((id) => id !== itemId && (!slot || accessorySlot(id) !== slot));
  return [...kept, itemId];
}

export function unequipAccessory(equipped, itemId) {
  return (equipped ?? []).filter((id) => id !== itemId);
}

// Tolerates the pre-multi-slot shape. Accounts created before this feature
// stored a single `equippedAccessory` string; reading both means nobody's
// crown quietly falls off on the deploy that ships this.
export function readEquippedAccessories(source) {
  if (Array.isArray(source?.equippedAccessories)) return source.equippedAccessories;
  return source?.equippedAccessory ? [source.equippedAccessory] : [];
}
