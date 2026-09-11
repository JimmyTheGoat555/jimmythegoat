import { useState } from 'react';
import { getTierByStage } from '../../utils/evolutionTiers';
import { ACCESSORY_SLOT_ORDER, getStoreItem, readEquippedAccessories } from '../../data/storeItems';

// Jimmy with his gear on — one renderer for every place an avatar appears
// (shop preview, profile, leaderboard row, feed post), so an accessory can
// never look right in one of them and wrong in another.
//
// Positioning notes, because these numbers are measured rather than
// eyeballed. Every tier sprite is ~1466px tall on its own canvas but a
// DIFFERENT width (528–673px), so horizontal percentages of a fixed box
// would drift between tiers. Two things make the coordinates below hold:
//
//   1. The wrapper shrink-wraps the image (`w-auto` + `h-full`), so
//      percentages are relative to the IMAGE box, not a letterboxed
//      container.
//   2. Vertically the sprites agree closely. Scanning the alpha channel:
//      opaque pixels start at 8–10% of the canvas (horn tips), the silhouette
//      pinches at ~20% of the body (the neck) and flares at ~25%
//      (shoulders). So head/eyes/neck land at roughly the same percentage
//      of canvas height on all four tiers.
//
// Each accessory is an emoji inside a viewBox'd <svg> rather than a styled
// <span>: the SVG scales its glyph with the box automatically, so one set
// of percentages works at a 40px leaderboard avatar and a 300px profile
// hero without a font-size calculation at every call site. Swapping in real
// artwork later means changing the <text> to an <image> and nothing else.
//
// `rotate` is a slot property, not an item one: anything worn at the neck
// drapes horizontally across the collarbone, and the ⛓️ glyph is drawn
// vertically, so without this it renders as a chain hanging down Jimmy's
// face. Real artwork would arrive pre-oriented and this becomes 0.
const ACCESSORY_SLOTS = {
  head: { top: '7%', width: '46%', rotate: 0 },
  eyes: { top: '16.5%', width: '33%', rotate: 0 },
  neck: { top: '26.5%', width: '34%', rotate: 90 },
};

// A leaderboard row or feed post shows a ~40px round avatar, and a
// full-body goat at that size is mostly legs. `crop="head"` zooms to the
// region the gear actually occupies. The transform wraps the image AND the
// accessories together, so they scale as one piece and stay aligned —
// which is the whole reason the overlays live in the same subtree rather
// than being positioned against the outer box.
// Scaling from a `top` origin already pulls the head into frame — the
// first cut also translated down 30% and pushed it straight back out,
// leaving an empty circle. Keep the nudge small and negative.
const HEAD_CROP = {
  // Shows roughly the top ~30% of the sprite: horns through collarbone.
  scale: 3.4,
  translateY: '-2%',
};

export default function JimmyAvatar({
  evolutionStage,
  // Accepts the array, or a whole account/post/summary object — whatever a
  // given call site happens to hold. readEquippedAccessories also tolerates
  // the pre-multi-slot `equippedAccessory` string.
  equippedAccessories = [],
  className = '',
  // 'head' zooms to the head/collarbone for small round avatars.
  crop = null,
  // Any extra layer to sit under the accessories (the dance animation on
  // WorkoutHome, say) — handed in rather than imported so this stays a
  // pure renderer.
  children,
  alt,
}) {
  const [spriteBroken, setSpriteBroken] = useState(false);
  const tier = getTierByStage(evolutionStage);
  const equipped = Array.isArray(equippedAccessories)
    ? equippedAccessories
    : readEquippedAccessories(equippedAccessories);

  // Draw in a fixed slot order, not the order things were equipped, so the
  // layering is stable: neck behind the head/eyes gear.
  const worn = ACCESSORY_SLOT_ORDER.map((slot) => {
    const id = equipped.find((itemId) => getStoreItem(itemId)?.slot === slot);
    const item = id ? getStoreItem(id) : null;
    return item ? { slot, item } : null;
  }).filter(Boolean);

  const cropped = crop === 'head';
  const inner = (
    <div className="relative inline-block h-full">
      {spriteBroken ? (
        <span className="flex h-full items-center justify-center text-[4em] leading-none">{tier?.emoji ?? '🐐'}</span>
      ) : (
        <img
          src={tier?.image}
          alt={alt ?? tier?.label ?? 'Jimmy'}
          onError={() => setSpriteBroken(true)}
          className="h-full w-auto object-contain"
          draggable={false}
        />
      )}

      {children}

      {/* Accessories never intercept taps — the avatar is frequently inside
          a button (a leaderboard row, a shop card). */}
      {!spriteBroken &&
        worn.map(({ slot, item }) => {
          const pos = ACCESSORY_SLOTS[slot];
          return (
            <svg
              key={slot}
              viewBox="0 0 100 100"
              role="img"
              aria-label={item.name}
              className="pointer-events-none absolute"
              style={{
                left: '50%',
                top: pos.top,
                width: pos.width,
                transform: `translate(-50%, -50%) rotate(${pos.rotate ?? 0}deg)`,
              }}
            >
              <text
                x="50"
                y="50"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="86"
                style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))' }}
              >
                {item.emoji}
              </text>
            </svg>
          );
        })}
    </div>
  );

  if (!cropped) return <div className={`inline-block h-full ${className}`}>{inner}</div>;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        className="flex h-full w-full items-start justify-center"
        style={{
          transform: `scale(${HEAD_CROP.scale}) translateY(${HEAD_CROP.translateY})`,
          transformOrigin: 'center top',
        }}
      >
        {inner}
      </div>
    </div>
  );
}
