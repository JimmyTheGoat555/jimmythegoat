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
// `mascot` (accessories only) is which character the piece was drawn for
// — 'jimmy' for his garments, 'gena' for her outfit sets — and absent
// means a shared piece both can wear. data/mascots.js's mascotCanWear is
// the only reader; the Store shelf, the renderer and the friend-profile
// sanitiser all go through it, so the field is what keeps his hoodie off
// her and her sets off him everywhere at once.
export const STORE_ITEMS = [
  { id: 'dance-shuffle', type: 'dance', name: 'The Shuffle', emoji: '🕺', cost: 600, videoDanceNumber: 1 },
  { id: 'dance-headbang', type: 'dance', name: 'Headbanger', emoji: '🤘', cost: 800, videoDanceNumber: 2 },
  { id: 'dance-victory', type: 'dance', name: 'Victory Lap', emoji: '🏆', cost: 1100, videoDanceNumber: 3 },
  { id: 'dance-moonwalk', type: 'dance', name: 'Moonwalk', emoji: '🌙', cost: 1500, videoDanceNumber: 4 },
  { id: 'accessory-cap', type: 'accessory', name: 'Ball Cap', emoji: '🧢', cost: 150, slot: 'head', rarity: 'common' },
  { id: 'accessory-shades', type: 'accessory', name: 'Shades', emoji: '🕶️', cost: 250, slot: 'eyes', rarity: 'common' },
  { id: 'accessory-tank', type: 'accessory', name: 'White Tank', emoji: '🎽', cost: 300, slot: 'body', rarity: 'common', mascot: 'jimmy' },
  { id: 'accessory-jeans', type: 'accessory', name: 'Ripped Jeans', emoji: '👖', cost: 400, slot: 'legs', rarity: 'rare', mascot: 'jimmy' },
  { id: 'accessory-hoodie', type: 'accessory', name: 'Cutoff Hoodie', emoji: '🧥', cost: 450, slot: 'body', rarity: 'rare', mascot: 'jimmy' },
  { id: 'accessory-headphones', type: 'accessory', name: 'Studio Headphones', emoji: '🎧', cost: 700, slot: 'head', rarity: 'rare' },
  // Gena's outfit sets. `slot: 'outfit'` is a whole-body set — one at a
  // time, like any slot — but unlike every other slot it is not an overlay:
  // equipping one swaps her SPRITE for the set's own render of her at the
  // tier she is on (data/mascots.js `outfits`, JimmyAvatar/JimmyAnimation).
  { id: 'accessory-gena-yellow', type: 'accessory', name: 'Yellow Set', emoji: '💛', cost: 350, slot: 'outfit', rarity: 'common', mascot: 'gena' },
  { id: 'accessory-gena-blue', type: 'accessory', name: 'Blue Set', emoji: '💙', cost: 500, slot: 'outfit', rarity: 'rare', mascot: 'gena' },
  { id: 'accessory-gena-pink', type: 'accessory', name: 'Pink Set', emoji: '🎀', cost: 750, slot: 'outfit', rarity: 'legendary', mascot: 'gena' },
];

// The whole-body slot. Kept out of ACCESSORY_SLOT_ORDER below on purpose:
// that order is the overlay z-stack, and an outfit is the sprite itself,
// drawn by the avatar before any overlay is considered.
export const OUTFIT_SLOT = 'outfit';

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
//
// firestore.rules caps `equippedAccessories` at 5 ids. Six slots exist
// (these five plus OUTFIT_SLOT), but nothing is sold for the neck, so five
// is still the most anyone can wear at once — a Jimmy loadout of legs,
// body, head and eyes carried over to Gena, plus one of her sets. The
// first neck item needs that cap raised to 6.
// Coins paid for one rewarded ad view. DISPLAY ONLY, like every price in
// this file — the amount actually credited comes from the server's own
// copy (functions/storeCatalog.js's AD_REWARD_COINS, which the callable
// reads), so this going stale can misprint a button, never mispay a
// balance. Keep them the same anyway.
export const AD_REWARD_COINS = 50;

// The rest-timer boost — twins of functions/storeCatalog.js, and display/
// UI-gating only like everything else in this file. The server decides
// what a token is worth and how many a day there are (functions/guards.js);
// these exist so the timer can print "2×" and hide the offer once today's
// are spent, before anyone sits through an ad that cannot pay.
export const REST_BOOST_MULTIPLIER = 2;
// How many of the boosted exercise's sets actually pay double. One ad buys
// three doubled sets, not an exercise that doubles for as long as somebody
// keeps adding rows to it — see functions/storeCatalog.js, which is where
// it is enforced. Here it is what the timer counts down for the lifter, so
// that "2 sets left" is on screen before the fourth one is logged rather
// than explained afterwards by a coin total that came up short.
export const REST_BOOST_MAX_SETS = 3;
export const REST_BOOSTS_PER_DAY = 3;
export const REST_BOOST_TTL_MS = 3 * 60 * 60 * 1000;

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
