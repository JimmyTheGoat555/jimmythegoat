import { useState } from 'react';
import { getTierByStage } from '../../utils/evolutionTiers';
import { ACCESSORY_SLOT_ORDER, getStoreItem, readEquippedAccessories } from '../../data/storeItems';
import { ACCESSORY_ART, artFor } from './accessoryArt';

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
      1: { top: '14.4%', left: '49.7%', width: '53.6%' },
      2: { top: '15.6%', left: '48.3%', width: '61.3%' },
      3: { top: '12.6%', left: '49.6%', width: '54.6%' },
      4: { top: '13.4%', left: '49.3%', width: '48.4%' },
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
      1: { top: '11.2%', left: '49.7%', width: '32.5%' },
      2: { top: '12.6%', left: '48.3%', width: '37.2%' },
      3: { top: '9.2%', left: '49.6%', width: '33.1%' },
      4: { top: '9.7%', left: '49.3%', width: '29.4%' },
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
  // largest. So body pieces get their own landmark, the NECK BASE — the narrowest row of the neck
  // pinch, before the shoulders flare: goat 24.5% of canvas height, buff
  // 25.5%, titan 23%, legend 21%. The garment's own collar is lined up
  // with that, which is the difference between Jimmy wearing a shirt and
  // Jimmy standing behind one. The first cut anchored to the chin and sat
  // ~6% too low, leaving his neck above the collar instead of through it.
  //
  // Widths are NOT near-constant across tiers the way the head pieces are.
  // The first cut assumed they were and dressed every goat in the Goat's
  // size, which left the Legend's chest hanging out either side of a vest
  // three sizes too small. They climb ~20% from tier 1 to tier 4 (hoodie
  // 45 -> 54, tank 43 -> 52), tuned against the render because the
  // silhouette measurements here are too noisy to trust: the arms are
  // fused to the torso in the alpha channel at exactly the rows that
  // matter, and each tier holds them at a different angle.
  //
  // See accessoryArt.jsx's `behind` for the other half of looking worn:
  // the strip of each garment that is drawn UNDER the sprite.
  'accessory-tank': {
    z: 10,
    stages: {
      1: { top: '39.2%', left: '50.5%', width: '54.7%' },
      2: { top: '39.0%', left: '48.4%', width: '60.7%' },
      3: { top: '40.8%', left: '50.0%', width: '63.5%' },
      4: { top: '43.5%', left: '49.2%', width: '65.6%' },
    },
  },
  'accessory-hoodie': {
    z: 10,
    stages: {
      1: { top: '38.1%', left: '50.5%', width: '65.9%' },
      2: { top: '37.3%', left: '48.4%', width: '69.2%' },
      3: { top: '38.4%', left: '50.0%', width: '71.2%' },
      4: { top: '40.1%', left: '49.2%', width: '72.5%' },
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
export function AccessoryLayer({ evolutionStage, equippedAccessories = [], depth = 'front', className = '' }) {
  const stage = getTierByStage(evolutionStage)?.stage ?? 1;
  const equipped = Array.isArray(equippedAccessories)
    ? equippedAccessories
    : readEquippedAccessories(equippedAccessories);

  // Fixed slot order, not the order things were equipped, so layering is
  // stable: the hoodie paints before the chain that lies on it, and the
  // lenses paint last.
  const behindPass = depth === 'behind';
  const worn = ACCESSORY_SLOT_ORDER.flatMap((slot) => {
    const id = equipped.find((itemId) => ACCESSORY_ART[itemId]?.slot === slot);
    if (!id) return [];
    const art = artFor(ACCESSORY_ART[id], stage);
    // The behind pass draws only the pieces that HAVE a back half.
    if (behindPass && !art.behind) return [];
    const place = layoutFor(id, stage);
    if (!place) return [];
    return [{ id, art, name: getStoreItem(id)?.name ?? id, place }];
  });

  if (worn.length === 0) return null;

  return (
    // Accessories never intercept taps — Jimmy is frequently inside a
    // button (a leaderboard row, a shop card) or is himself tappable (the
    // lobby replays his dance on click).
    <div
      className={`pointer-events-none absolute inset-0 flex items-center justify-center ${className}`}
      // The sprite sits between the two passes, so the back of a collar is
      // hidden by the neck in front of it.
      style={{ zIndex: behindPass ? 0 : 10 }}
    >
      <div
        className="relative h-full max-w-full"
        style={{ aspectRatio: `${SPRITE_ASPECT[stage] ?? SPRITE_ASPECT[1]}` }}
      >
        {worn.map(({ id, art, name, place }) => {
          const style = { ...place, transform: 'translate(-50%, -50%)', filter: SHADOW };
          if (art.src) {
            // A piece with a back half is drawn TWICE, once per pass, each
            // time with the other half clipped off. Clipping the same image
            // rather than shipping two files keeps the two halves pixel-
            // exact neighbours — any seam would be a hairline of background
            // straight down the middle of Jimmy's chest.
            if (art.behind) {
              const cut = `${art.behind * 100}%`;
              style.clipPath = behindPass ? `inset(0 0 ${100 - art.behind * 100}% 0)` : `inset(${cut} 0 0 0)`;
              // The back half is behind an opaque goat; a shadow on it can
              // only leak out around his edges as a grey halo.
              if (behindPass) delete style.filter;
            }
            return (
              <img
                key={id}
                src={art.src}
                alt={behindPass ? '' : name}
                aria-hidden={behindPass ? true : undefined}
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

// Named sizes, in px. Jimmy is drawn HEIGHT-first everywhere (the sprite is
// `h-full w-auto`, so its width follows from whichever tier is on screen),
// which is what makes one set of accessory coordinates work at every scale:
// the percentages are of the sprite's own box, so scaling the box scales
// the gear with it. Nothing here needs to know about accessories at all.
//
// `sm` is the leaderboard/feed row, `xl` the Workout lobby hero. Anything
// in between can pass a number.
const SIZES = { xs: 28, sm: 40, md: 64, lg: 144, xl: 208 };

export default function JimmyAvatar({
  evolutionStage,
  // Accepts the array, or a whole account/post/summary object — whatever a
  // given call site happens to hold. readEquippedAccessories also tolerates
  // the pre-multi-slot `equippedAccessory` string.
  equippedAccessories = [],
  className = '',
  // A token from SIZES or a number of px. Sets the HEIGHT — and, when
  // cropped, the width too, since a head crop is square. Optional: leave it
  // out and size the avatar from `className` (an `h-full` inside a box you
  // control, say) exactly as before.
  size = null,
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
  const px = typeof size === 'number' ? size : SIZES[size] ?? null;
  // Width only when cropped: uncropped, the sprite's aspect decides it, and
  // pinning both would letterbox him inside his own box.
  const sizeStyle = px == null ? undefined : { height: px, ...(cropped ? { width: px } : null) };
  const inner = (
    <div className="relative inline-block h-full">
      {/* Behind the goat. Positioned elements paint above static ones no
          matter the DOM order, so the sprite below carries an explicit
          z-index rather than relying on being written after this. */}
      {!spriteBroken && (
        <AccessoryLayer evolutionStage={tier?.stage} equippedAccessories={equippedAccessories} depth="behind" />
      )}
      {spriteBroken ? (
        <span className="flex h-full items-center justify-center text-[4em] leading-none">{tier?.emoji ?? '🐐'}</span>
      ) : (
        <img
          src={tier?.image}
          alt={alt ?? tier?.label ?? 'Jimmy'}
          onError={() => setSpriteBroken(true)}
          className="relative z-[5] h-full w-auto object-contain"
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

  if (!cropped) {
    return (
      <div className={`inline-block ${px == null ? 'h-full' : ''} ${className}`} style={sizeStyle}>
        {inner}
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`} style={sizeStyle}>
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
