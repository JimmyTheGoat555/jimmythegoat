import { useState } from 'react';
import { getTierByStage } from '../../utils/evolutionTiers';
import { ACCESSORY_SLOT_ORDER, getStoreItem, readEquippedAccessories } from '../../data/storeItems';
import { ACCESSORY_ART } from './accessoryArt';

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
// Accessory artwork is inline SVG (see accessoryArt.jsx), not emoji and
// not PNGs: it stays sharp from a 36px leaderboard row to a full-screen
// hero, costs a couple of KB, and each piece carries its own viewBox and
// placement so a sweatband and a crown can have honestly different
// proportions instead of being forced through one box.
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

// Where every accessory sits, per accessory, per evolution stage.
//
// It has to be per stage, because the four sprites are not one drawing at
// four sizes. They share a height (~1466px) but NOT a width — the Legend's
// traps make his canvas 673px wide against the Goat's 528 for a head that
// is barely any bigger — and percentages here resolve against the SPRITE
// box (the wrapper shrink-wraps the image, see below). So a single figure
// for all four tiers puts the shades on the Goat's eyes and somewhere over
// the Legend's cheekbones.
//
// The numbers come from landmarks read off the sprites, then corrected by
// eye against the render. The landmark is PUPIL SPAN — the distance between
// the two pupils as a share of canvas width — because that is what a pair
// of glasses has to bracket, and unlike "face width" it is unambiguous:
// these goats have floppy ears that merge into the cheek in the alpha
// channel, and an outline-derived face width silently includes them.
//
//   tier      canvas   pupil span   eye line   face midline
//   goat      528px    16.6%        16.8%      49.7%
//   buff      438px    19.0%        17.9%      48.3%
//   titan     552px    16.9%        15.2%      49.6%
//   legend    673px    15.0%        16.2%      49.3%
//
// Every head/eye/neck piece is authored once against the Goat and then
// scaled by that tier's pupil span relative to his (buff 1.14x, titan
// 1.02x, legend 0.90x), with its vertical offset from the eye line scaled
// the same way. `left` is the face midline: the sprites are not perfectly
// centred on their canvases, and the Buff's 1.4% offset is ~3px on a phone
// but very visible once crop="head" magnifies it 3.4x.
//
// `top` is the CENTRE of the piece as a % of sprite height, because the
// overlay is translated -50%,-50%. There is no `height`: every PNG is
// pre-trimmed to its alpha bounds and drawn at its natural aspect, so
// pinning width alone is what keeps a 2.6:1 pair of shades from being
// stretched into a 1:1 box. `z` is a fixed per-slot stack — body behind,
// lenses in front — so two head items can never argue about order.
const ACCESSORY_LAYOUT = {
  'accessory-shades': {
    z: 40,
    stages: {
      1: { top: '17.3%', left: '49.7%', width: '34.9%' },
      2: { top: '18.4%', left: '48.3%', width: '39.9%' },
      3: { top: '15.7%', left: '49.6%', width: '35.5%' },
      4: { top: '16.8%', left: '49.3%', width: '31.5%' },
    },
  },
  // Headphones are the one piece whose art is not centred on what it has
  // to line up with: the earcups sit at 67% of the PNG's height with the
  // band arcing above them, so `top` (which positions the PNG's CENTRE) is
  // well above the ear line. The asset was also widened — see the note in
  // accessoryArt.jsx — because as drawn the cups nearly touch.
  'accessory-headphones': {
    z: 30,
    stages: {
      1: { top: '14.0%', left: '49.7%', width: '62.0%' },
      2: { top: '15.2%', left: '48.3%', width: '71.0%' },
      3: { top: '12.2%', left: '49.6%', width: '63.1%' },
      4: { top: '13.0%', left: '49.3%', width: '56.0%' },
    },
  },
  'accessory-headband': {
    z: 30,
    stages: {
      1: { top: '12.5%', left: '49.7%', width: '42.0%' },
      2: { top: '13.8%', left: '48.3%', width: '48.1%' },
      // Titan and Legend are hand-corrected off the derived value (10.6 and
      // 11.2): a band's real landmark is the brow ridge, and on those two
      // it sits lower relative to the eyes than the derivation assumes, so
      // the derived number floated the band clear of the forehead.
      3: { top: '12.4%', left: '49.6%', width: '42.8%' },
      4: { top: '13.0%', left: '49.3%', width: '38.0%' },
    },
  },
  'accessory-crown': {
    z: 30,
    stages: {
      1: { top: '7.5%', left: '49.7%', width: '44.0%' },
      2: { top: '9.1%', left: '48.3%', width: '50.4%' },
      3: { top: '5.3%', left: '49.6%', width: '44.8%' },
      4: { top: '5.5%', left: '49.3%', width: '39.8%' },
    },
  },
  // `left` is NOT the face midline here: the cap is drawn three-quarter-on
  // with its dome 9.2% of the image width left of the image's centre, so
  // each of these is the midline pushed right by that much of its own
  // width. Otherwise the peak balances the dome off Jimmy's ear.
  'accessory-cap': {
    z: 30,
    stages: {
      1: { top: '7.2%', left: '53.8%', width: '44.0%' },
      2: { top: '8.8%', left: '52.9%', width: '50.4%' },
      3: { top: '5.0%', left: '53.7%', width: '44.8%' },
      4: { top: '5.1%', left: '53.0%', width: '39.8%' },
    },
  },
  'accessory-chain': {
    z: 20,
    stages: {
      1: { top: '28.0%', left: '49.7%', width: '48.0%' },
      2: { top: '28.5%', left: '48.3%', width: '54.9%' },
      3: { top: '27.1%', left: '49.6%', width: '48.9%' },
      4: { top: '29.1%', left: '49.3%', width: '43.4%' },
    },
  },
  // The torso does NOT follow the head's numbers — it is the part of Jimmy
  // that actually changes between tiers, and it changes the other way: the
  // Legend's head is the smallest share of his canvas and his chest the
  // largest. So body pieces are anchored to their own landmark, the
  // SHOULDER LINE — the row where the silhouette jumps outward as the arms
  // begin (goat 27.5% of canvas height, buff 27%, titan and legend 25%) —
  // and sized off the shoulder span there (goat 67% of canvas width, buff
  // 68.5%, titan 67.8%, legend 68.4%, taken at 0.82x because the hoodie is
  // sleeveless and stops inside the deltoid).
  //
  // Vertically the anchor is the CHIN, not the shoulder: the hood is drawn
  // open and tall, and lining its seam up with the anatomical shoulder put
  // the empty hood interior over Jimmy's jaw on the two smaller tiers —
  // he looked swallowed. Measured chins (the narrowest row of the neck
  // pinch) are goat 22% of canvas height, buff 23.5%, titan 21.5%, legend
  // 20%; the hood's top edge sits ~3% below each. `top` positions the PNG's
  // CENTRE, hence + half the rendered height on top of that, which is why
  // these four numbers are not a simple scale of one another.
  // A tank's shoulder seam is at 3% of its own height (it is all straps up
  // there), against the hoodie's 20% — so it hangs from the shoulder line
  // directly, with none of the hoodie's chin correction.
  'accessory-tank': {
    z: 10,
    stages: {
      1: { top: '41.1%', left: '50.5%', width: '50.0%' },
      2: { top: '38.5%', left: '48.4%', width: '51.0%' },
      3: { top: '39.3%', left: '50.0%', width: '50.5%' },
      4: { top: '42.7%', left: '49.2%', width: '51.0%' },
    },
  },
  'accessory-hoodie': {
    z: 10,
    stages: {
      1: { top: '42.0%', left: '50.5%', width: '55.0%' },
      2: { top: '40.7%', left: '48.4%', width: '56.0%' },
      3: { top: '42.6%', left: '50.0%', width: '55.6%' },
      4: { top: '45.6%', left: '49.2%', width: '56.0%' },
    },
  },
};

// Grounds the accessory on the sprite instead of letting it float — the
// PNGs are lit flat and read as stickers without it.
const SHADOW = 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))';

function layoutFor(itemId, stage) {
  const entry = ACCESSORY_LAYOUT[itemId];
  if (!entry) return null;
  return { ...(entry.stages[stage] ?? entry.stages[1]), zIndex: entry.z };
}

// Each sprite's canvas aspect (width / height). Needed by AccessoryLayer —
// see the note there.
const SPRITE_ASPECT = { 1: 528 / 1466, 2: 438 / 1467, 3: 552 / 1467, 4: 673 / 1462 };

// The worn accessories on their own, sized and placed against Jimmy's
// sprite — no sprite of its own, so it can be dropped over one that is
// already being drawn (and animated) by somebody else.
//
// The one subtlety is what the percentages are relative to. Every screen
// that shows Jimmy BIG draws him with `object-contain` inside a fixed
// square: the Progress card's w-40 h-40, the Workout lobby's w-52 h-52.
// A portrait sprite in a square box gets letterboxed, so a percentage of
// that container lands nowhere near the same percentage of the goat — on
// the Goat sprite the image is only 36% of the box's width. This rebuilds
// the image's own box (full height, width = height x the sprite's aspect,
// horizontally centred, which is exactly what object-contain produces for
// a portrait image in a wider box) and positions inside THAT. One set of
// coordinates then serves the 36px leaderboard row and the 208px lobby
// hero alike.
//
// It assumes the sprite is height-constrained, i.e. the container is at
// least as wide as it is tall. True everywhere Jimmy is drawn (every box
// is square) and the widest sprite is 0.46:1, but `max-w-full` keeps it
// from overflowing rather than silently mis-anchoring if that changes.
export function AccessoryLayer({ evolutionStage, equippedAccessories = [], className = '' }) {
  const stage = getTierByStage(evolutionStage)?.stage ?? 1;
  const equipped = Array.isArray(equippedAccessories)
    ? equippedAccessories
    : readEquippedAccessories(equippedAccessories);

  // Fixed slot order, not the order things were equipped, so layering is
  // stable: the hoodie paints before the chain that lies on it, and the
  // lenses paint last.
  const worn = ACCESSORY_SLOT_ORDER.flatMap((slot) => {
    const id = equipped.find((itemId) => ACCESSORY_ART[itemId]?.slot === slot);
    if (!id) return [];
    const place = layoutFor(id, stage);
    if (!place) return [];
    return [{ id, art: ACCESSORY_ART[id], name: getStoreItem(id)?.name ?? id, place }];
  });

  if (worn.length === 0) return null;

  return (
    // Accessories never intercept taps — Jimmy is frequently inside a
    // button (a leaderboard row, a shop card) or is himself tappable (the
    // lobby replays his dance on click).
    <div className={`pointer-events-none absolute inset-0 flex items-center justify-center ${className}`}>
      <div
        className="relative h-full max-w-full"
        style={{ aspectRatio: `${SPRITE_ASPECT[stage] ?? SPRITE_ASPECT[1]}` }}
      >
        {worn.map(({ id, art, name, place }) => {
          const style = { ...place, transform: 'translate(-50%, -50%)', filter: SHADOW };
          if (art.src) {
            return (
              <img
                key={id}
                src={art.src}
                alt={name}
                className="pointer-events-none absolute h-auto"
                style={style}
                draggable={false}
              />
            );
          }
          // Gradient ids are namespaced per item because several avatars
          // can share a page and duplicate ids would cross-wire the fills.
          const { Art } = art;
          return (
            <svg
              key={id}
              viewBox={art.viewBox}
              role="img"
              aria-label={name}
              className="pointer-events-none absolute overflow-visible"
              style={style}
            >
              <Art id={`acc-${id}`} />
            </svg>
          );
        })}
      </div>
    </div>
  );
}

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

      {/* The wrapper already shrink-wraps the image, so AccessoryLayer's
          box reconstruction is a no-op here and resolves to the same
          rectangle. Sharing it anyway is the point: the coordinates can
          only ever be calibrated once. */}
      {!spriteBroken && (
        <AccessoryLayer evolutionStage={tier?.stage} equippedAccessories={equippedAccessories} />
      )}
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
