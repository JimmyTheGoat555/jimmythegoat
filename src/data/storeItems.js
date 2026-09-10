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
  { id: 'dance-shuffle', type: 'dance', name: 'The Shuffle', emoji: '🕺', cost: 150, videoDanceNumber: 1 },
  { id: 'dance-headbang', type: 'dance', name: 'Headbanger', emoji: '🤘', cost: 150, videoDanceNumber: 2 },
  { id: 'dance-victory', type: 'dance', name: 'Victory Lap', emoji: '🏆', cost: 300, videoDanceNumber: 3 },
  { id: 'dance-moonwalk', type: 'dance', name: 'Moonwalk', emoji: '🌙', cost: 500, videoDanceNumber: 4 },
  { id: 'accessory-cap', type: 'accessory', name: 'Backwards Cap', emoji: '🧢', cost: 100 },
  { id: 'accessory-shades', type: 'accessory', name: 'Shades', emoji: '🕶️', cost: 200 },
  { id: 'accessory-chain', type: 'accessory', name: 'Gold Chain', emoji: '⛓️', cost: 350 },
  { id: 'accessory-crown', type: 'accessory', name: 'Crown', emoji: '👑', cost: 750 },
];
