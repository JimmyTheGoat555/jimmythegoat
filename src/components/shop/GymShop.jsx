import { useState } from 'react';
import {
  OUTFIT_SLOT,
  STORE_ITEMS,
  RARITY_STYLES,
  equipAccessory,
  getStoreItem,
  unequipAccessory,
  readEquippedAccessories,
} from '../../data/storeItems';
import JimmyAnimation from '../evolution/JimmyAnimation';
import JimmyAvatar from '../evolution/JimmyAvatar';
import { useJimmyLook } from '../../context/JimmyLook';
import AdRewardCard from './AdRewardCard';
import { danceNumberForItemId, getDancePreviewPath } from '../../utils/danceAnimations';
import {
  SELECTABLE_MASCOTS,
  getMascot,
  mascotCanWear,
  mascotHasCosmetics,
  mascotHasDances,
  mascotSpriteFor,
} from '../../data/mascots';

// A dance's/accessory's cost here is display-only — see storeItems.js.
// The actual charge always comes from the server's own copy
// (functions/storeCatalog.js), so this file being stale can only ever make
// the UI show a wrong price, never let anyone pay a wrong one.
// `jimmyLook` defaults rather than being assumed: this component renders the
// avatar now, and reaching into an absent prop for `.evolutionStage` took the
// whole Store tab down behind the error boundary — a white screen because one
// of the two call sites was missing an attribute.
function ItemCard({
  item, owned, equipped, canAfford, busy, onBuy, onEquip, previewSrc, tierImage,
  jimmyLook = { evolutionStage: 1, equippedAccessories: [] },
}) {
  // Rarity colours the frame and the label. Only shown once you own the
  // item — before that the price is the thing that matters, and a loud
  // gold border on something unaffordable is just noise.
  const rarity = RARITY_STYLES[item.rarity] ?? null;
  const frame = equipped
    ? { '--tw-ring-color': 'var(--ember)' }
    : rarity && owned
      ? { '--tw-ring-color': rarity.color }
      : undefined;
  return (
    <div
      className={`card p-4 flex flex-col items-center gap-2 text-center ${equipped || (rarity && owned) ? 'ring-2' : ''}`}
      style={frame}
    >
      {rarity && (
        <span
          className="text-[9px] font-bold uppercase tracking-[0.18em]"
          style={{ color: rarity.color }}
        >
          {rarity.label}
        </span>
      )}
      {previewSrc ? (
        // The dance itself is the label — you can see what you're buying,
        // which "Moonwalk" never told anyone. Shown as the CURRENT
        // evolution, so it previews the character you actually have. Plays
        // once on arrival and again on tap (JimmyAnimation), rather than
        // four clips looping at each other forever on one screen.
        <JimmyAnimation
          animationSrc={previewSrc}
          staticImageSrc={tierImage}
          // Previewing a dance on the goat you actually have — gear,
          // mascot and all — rather than a stock one. Same look as the
          // lobby. The spread carries `mascot`, and `previewSrc` was
          // already resolved for that mascot by the caller, so a Gena
          // shopper sees Gena perform each dance from her own clips.
          {...jimmyLook}
          alt={item.name}
          className="w-24 h-28"
        />
      ) : (
        <>
          {/* Modelled on YOUR character, at the tier you are actually on
              — not a flat cut-out of the garment. Two reasons it has to be
              the real avatar rather than a product shot: the art is drawn
              per stage, so the Legend's hoodie genuinely is not the
              Goat's, and a garment out of context tells you nothing about
              how it will sit on the goat you own. Same component as the
              lobby, so the card cannot drift from what you get.
              Deliberately ONLY this item — the shop is showing you the
              thing for sale, not your current outfit with one swap.

              Always the WHOLE character, full length, never a head crop —
              the card is a picture of your goat in the item, and the
              user asked to see all of them that way. A pair of shades is
              small at this size; the box is taller than the dance cards'
              to give every piece the most room a two-up grid has. */}
          <span className="flex h-36 w-full items-center justify-center">
            <JimmyAvatar
              evolutionStage={jimmyLook.evolutionStage}
              equippedAccessories={[item.id]}
              // Your mascot, unlike the dance cards above: an accessory
              // sits differently on Gena than on Jimmy (see
              // GENA_ACCESSORY_LAYOUT), and her outfit sets are renders
              // of HER, so modelling it on the wrong character is
              // exactly the thing this card exists to avoid.
              mascot={jimmyLook.mascot}
              size={144}
              alt={item.name}
            />
          </span>
          <p className="text-sm font-semibold text-neutral-100">{item.name}</p>
        </>
      )}
      {owned ? (
        // Accessories toggle (multi-slot, so taking one off is a real
        // action); a dance is single-choice, so an equipped one stays
        // disabled — there's nothing to toggle it to.
        <button
          type="button"
          onClick={onEquip}
          disabled={equipped && item.type === 'dance'}
          className={`w-full mt-1 text-sm font-semibold py-2.5 rounded-xl ${
            equipped ? 'bg-[var(--ember)]/20 text-[var(--ember)]' : 'bg-white/10 text-neutral-200'
          }`}
        >
          {equipped ? (item.type === 'dance' ? '✓ Equipped' : '✓ Unequip') : 'Equip'}
        </button>
      ) : (
        <button
          type="button"
          onClick={onBuy}
          disabled={busy || !canAfford}
          className="w-full mt-1 bg-[var(--ember)] text-white font-semibold text-sm py-2.5 rounded-xl disabled:opacity-40"
        >
          {busy ? 'Buying…' : `🪙 ${item.cost}`}
        </button>
      )}
    </div>
  );
}

// `account` is the same users/{uid} doc ProfileView gets from useAuth — has
// coins/unlockedDances/unlockedAccessories/equippedDance/equippedAccessory
// directly on it. `onPurchase`/`onEquip` are useEconomy().purchaseItem/
// equipItem; this component holds no economy state of its own, same
// reasoning as everywhere else this pass touched (see hooks/useEconomy.js)
// — the live account doc IS the state, updated the moment a purchase or
// equip actually goes through. Whatever's equipped here is what shows up
// on your NEXT logged workout's feed post — see functions/economy.js.
export default function GymShop({
  account,
  onPurchase,
  onEquip,
  onSetAccessories,
  evolutionStage = null,
  // Passed straight through to the ad card's cooldown bypass — the Shop
  // itself has no admin behaviour of its own.
  isAdmin = false,
}) {
  const [busyItemId, setBusyItemId] = useState(null);
  const [error, setError] = useState(null);

  const coins = account?.coins ?? 0;
  const unlockedDances = account?.unlockedDances ?? [];
  const unlockedAccessories = account?.unlockedAccessories ?? [];

  const isOwned = (item) =>
    (item.type === 'dance' ? unlockedDances : unlockedAccessories).includes(item.id);
  // Tolerates the pre-multi-slot shape, so an existing account's equipped
  // accessory doesn't appear to fall off on the deploy that ships this.
  const equippedAccessories = readEquippedAccessories(account);
  const jimmyLook = useJimmyLook();
  const isEquipped = (item) =>
    item.type === 'dance' ? account?.equippedDance === item.id : equippedAccessories.includes(item.id);

  const handleBuy = async (item) => {
    setError(null);
    setBusyItemId(item.id);
    try {
      await onPurchase(item.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyItemId(null);
    }
  };

  const handleEquip = async (item) => {
    setError(null);
    try {
      if (item.type === 'dance') {
        await onEquip('equippedDance', item.id);
        return;
      }
      // The slot rule (a second hat replaces the first) lives in
      // equipAccessory — see data/storeItems.js — so this handler just
      // picks which direction to go.
      const next = isEquipped(item)
        ? unequipAccessory(equippedAccessories, item.id)
        : equipAccessory(equippedAccessories, item.id);
      navigator.vibrate?.([30]);
      await onSetAccessories(next);
    } catch (err) {
      setError(err.message);
    }
  };

  // Nothing in the catalogue is sold to a mascot that cannot wear it.
  // Filtered rather than hidden with CSS so an item a Gena account cannot
  // use is not merely invisible — it has no buy button to reach, no
  // keyboard focus and no place in the DOM at all.
  const character = getMascot(jimmyLook.mascot);
  const dances = mascotHasDances(character.id) ? STORE_ITEMS.filter((i) => i.type === 'dance') : [];
  // Per item, not per shelf, and per CHARACTER: the shelves are what the
  // one you train as can wear (data/mascots.js's mascotCanWear, reading
  // the catalog's `mascot` locks). Gena sees her outfit sets and the
  // shared head gear; Jimmy sees his garments and the same head gear.
  // The other character's clothes are not "hidden" — they are on the
  // other character's shelf, and switching in Settings swaps the shelf.
  const wearable = STORE_ITEMS.filter((i) => i.type === 'accessory' && mascotCanWear(character.id, i.id));
  // Outfit sets on their own shelf: a whole-body set is a different kind
  // of purchase from a hat, and it replaces the sprite rather than
  // sitting on it (data/storeItems.js's OUTFIT_SLOT).
  const outfits = wearable.filter((i) => i.slot === OUTFIT_SLOT);
  const accessories = wearable.filter((i) => i.slot !== OUTFIT_SLOT);
  const shelvesEmpty = !mascotHasCosmetics(character.id);
  // Owned, but the other character's — the hoodie you bought as Jimmy,
  // now that you train as Gena. Kept on the account and off this shelf;
  // said once, under the shelves, so the missing card reads as "his"
  // rather than "gone".
  const ownedForOther = unlockedAccessories.filter((id) => {
    const item = getStoreItem(id);
    return item?.type === 'accessory' && !mascotCanWear(character.id, id);
  }).length;
  const otherCharacter = SELECTABLE_MASCOTS.find((m) => m.id !== character.id) ?? null;
  // The still frame under each dance card: HER sprite, at the stage the
  // preview is drawn for. The tier art App used to hand down was Jimmy's,
  // and only ever showed if her clip failed to load — the wrong goat, at
  // exactly the moment something had already gone wrong.
  const cardSprite = mascotSpriteFor(character.id, evolutionStage ?? jimmyLook.evolutionStage);

  return (
    <div className="flex flex-col gap-6 pt-6 pb-nav">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-neutral-50">Store</h1>
        <span className="text-lg font-semibold text-neutral-200">🪙 {coins.toLocaleString('en-US')}</span>
      </div>

      {error && (
        <p className="text-sm text-[var(--danger)] px-1" role="alert">
          {error}
        </p>
      )}

      {/* Above the shelves, because "I cannot afford this" is the thought
          it answers, and below the balance it is about. */}
      <AdRewardCard lastAdRewardAt={account?.lastAdRewardAt ?? null} isAdmin={isAdmin} />

      {/* An empty shop with no explanation reads as a broken shop, and
          this one is empty for a reason the user can act on (switch back
          to Jimmy) rather than a fault. Says what is true, including the
          part people will care about most: whatever they already bought is
          still theirs. */}
      {shelvesEmpty && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4">
          <p className="text-sm font-semibold text-neutral-100">
            {character.name}&rsquo;s wardrobe is still being made.
          </p>
          <p className="mt-1.5 text-xs leading-snug text-neutral-400">
            Every dance and accessory in the store was drawn for Jimmy, so they&rsquo;re hidden while
            you&rsquo;re training as {character.name}. Anything you already own is kept — switch back to
            Jimmy in Settings and it&rsquo;s all exactly where you left it.
          </p>
        </div>
      )}

      {dances.length > 0 && (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Dances</h2>
        <div className="grid grid-cols-2 gap-3">
          {dances.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              owned={isOwned(item)}
              equipped={isEquipped(item)}
              canAfford={coins >= item.cost}
              busy={busyItemId === item.id}
              previewSrc={getDancePreviewPath(
                danceNumberForItemId(item.id),
                evolutionStage,
                jimmyLook.mascot,
              )}
              tierImage={cardSprite}
              jimmyLook={jimmyLook}
              onBuy={() => handleBuy(item)}
              onEquip={() => handleEquip(item)}
            />
          ))}
        </div>
      </section>
      )}

      {outfits.length > 0 && (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Outfits</h2>
        <div className="grid grid-cols-2 gap-3">
          {outfits.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              owned={isOwned(item)}
              equipped={isEquipped(item)}
              canAfford={coins >= item.cost}
              busy={busyItemId === item.id}
              onBuy={() => handleBuy(item)}
              onEquip={() => handleEquip(item)}
              jimmyLook={jimmyLook}
            />
          ))}
        </div>
      </section>
      )}

      {accessories.length > 0 && (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Accessories</h2>
        <div className="grid grid-cols-2 gap-3">
          {accessories.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              owned={isOwned(item)}
              equipped={isEquipped(item)}
              canAfford={coins >= item.cost}
              busy={busyItemId === item.id}
              onBuy={() => handleBuy(item)}
              onEquip={() => handleEquip(item)}
              jimmyLook={jimmyLook}
            />
          ))}
        </div>
      </section>
      )}

      {/* Something they own is the other character's: say where it went,
          so a card that was here last week reads as "on his shelf" rather
          than "lost". Nothing to say when everything owned is wearable. */}
      {!shelvesEmpty && ownedForOther > 0 && otherCharacter && (
        <p className="px-1 text-xs leading-snug text-neutral-500">
          {ownedForOther === 1
            ? `One item you own is ${otherCharacter.name}’s, so it’s off the shelf while you train as ${character.name}.`
            : `${ownedForOther} items you own are ${otherCharacter.name}’s, so they’re off the shelf while you train as ${character.name}.`}{' '}
          Nothing is lost — switch to {otherCharacter.name} in Settings and it&rsquo;s all back.
        </p>
      )}

      <p className="text-xs text-neutral-600 px-1">
        Earn coins by logging real, complete workouts — see your Profile for today's limit.
        {!shelvesEmpty && " Whatever's equipped here shows up on your next workout in friends' feeds."}
      </p>
    </div>
  );
}
