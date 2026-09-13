import { readEquippedAccessories } from '../data/storeItems';

// "You own something you have never put on."
//
// Drives the red count on the Store tab, so a chest reward does not sit
// unnoticed in an inventory the user has no reason to open. The Silver
// Lootbox hands out a dance and then simply closes — nothing equips it,
// and nothing else in the app mentions it again.
//
// DERIVED, not stored. The rule is per SLOT rather than per item:
//
//   * you own at least one dance and have none equipped  → 1
//   * you own at least one accessory and have none equipped → 1
//
// That is deliberately not "count everything unequipped". Someone who
// owns six accessories and wears two has not forgotten anything — they
// chose — and a badge that never clears is a badge people learn to
// ignore. Anchoring on "this slot is empty while you have something to
// put in it" is exactly the state a chest leaves you in, and it clears
// the moment you equip anything.
//
// Deriving it also means no new field, no rule change and no write path:
// the badge is a pure function of data the account doc already carries,
// so it cannot drift out of sync with what is actually equipped.
//
// Known edge, accepted: deliberately unequipping everything brings the
// badge back. That reads as correct — an empty slot with items available
// IS something to act on — and the alternative is persisting a
// "dismissed" flag for a nudge this small.
export function unequippedRewardCount(account) {
  if (!account) return 0;
  let count = 0;

  const dances = Array.isArray(account.unlockedDances) ? account.unlockedDances : [];
  if (dances.length > 0 && !account.equippedDance) count += 1;

  const accessories = Array.isArray(account.unlockedAccessories) ? account.unlockedAccessories : [];
  // readEquippedAccessories folds in the pre-multi-slot `equippedAccessory`
  // string, so an account that predates slots is not told to equip
  // something it is already wearing.
  if (accessories.length > 0 && readEquippedAccessories(account).length === 0) count += 1;

  return count;
}
