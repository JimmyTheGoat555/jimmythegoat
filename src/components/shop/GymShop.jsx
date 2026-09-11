import { useState } from 'react';
import {
  STORE_ITEMS,
  RARITY_STYLES,
  equipAccessory,
  unequipAccessory,
  readEquippedAccessories,
} from '../../data/storeItems';
import JimmyAnimation from '../evolution/JimmyAnimation';
import { danceNumberForItemId, getDancePreviewPath } from '../../utils/danceAnimations';

// A dance's/accessory's cost here is display-only — see storeItems.js.
// The actual charge always comes from the server's own copy
// (functions/storeCatalog.js), so this file being stale can only ever make
// the UI show a wrong price, never let anyone pay a wrong one.
function ItemCard({ item, owned, equipped, canAfford, busy, onBuy, onEquip, previewSrc, tierImage }) {
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
          alt={item.name}
          className="w-24 h-28"
        />
      ) : (
        <>
          <span className="text-4xl">{item.emoji}</span>
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
export default function GymShop({ account, onPurchase, onEquip, onSetAccessories, evolutionStage = null, tierImage = null }) {
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

  const dances = STORE_ITEMS.filter((i) => i.type === 'dance');
  const accessories = STORE_ITEMS.filter((i) => i.type === 'accessory');

  return (
    <div className="flex flex-col gap-6 pt-6 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-neutral-50">Store</h1>
        <span className="text-lg font-semibold text-neutral-200">🪙 {coins.toLocaleString('en-US')}</span>
      </div>

      {error && (
        <p className="text-sm text-[var(--danger)] px-1" role="alert">
          {error}
        </p>
      )}

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
              previewSrc={getDancePreviewPath(danceNumberForItemId(item.id), evolutionStage)}
              tierImage={tierImage}
              onBuy={() => handleBuy(item)}
              onEquip={() => handleEquip(item)}
            />
          ))}
        </div>
      </section>

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
            />
          ))}
        </div>
      </section>

      <p className="text-xs text-neutral-600 px-1">
        Earn coins by logging real, complete workouts — see your Profile for today's limit. Whatever's
        equipped here shows up on your next workout in friends' feeds.
      </p>
    </div>
  );
}
