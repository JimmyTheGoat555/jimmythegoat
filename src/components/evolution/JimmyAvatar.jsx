import { useState } from 'react';
import { getTierByStage } from '../../utils/evolutionTiers';
import { ACCESSORY_SLOT_ORDER, getStoreItem, readEquippedAccessories } from '../../data/storeItems';
import { ACCESSORY_ART, artFor } from './accessoryArt';
import { FIRE_STREAK_MIN, streakAuraClass } from '../../utils/streak';
import {
  DEFAULT_MASCOT_ID,
  MASCOT_GENA,
  accessoryArtStageFor,
  getMascot,
  mascotCanWear,
  mascotHasAccessories,
  mascotSpriteAspect,
  mascotSpriteFor,
  outfitSpriteFor,
} from '../../data/mascots';

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
// placement, so a pair of shades and a hoodie can have honestly different
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
      1: { top: '16.9%', left: '49.7%', width: '38.0%' },
      2: { top: '18.0%', left: '48.3%', width: '43.5%' },
      3: { top: '15.3%', left: '49.6%', width: '38.7%' },
      4: { top: '16.4%', left: '49.3%', width: '34.3%' },
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
  // Legs. The hip and the sole sit at the same share of canvas height on
  // all four sprites (45.0% and 84.0%), so only the width changes — scaled
  // by the leg span at 62% height, where the hands are clear of the thighs.
  'accessory-jeans': {
    z: 5,
    stages: {
      1: { top: '65.4%', left: '50.6%', width: '58.6%' },
      2: { top: '65.4%', left: '48.3%', width: '54.7%' },
      3: { top: '65.4%', left: '50.0%', width: '50.0%' },
      4: { top: '65.4%', left: '49.1%', width: '46.9%' },
    },
  },
  'accessory-tank': {
    z: 10,
    stages: {
      // Measured from each stage's own composite, not scaled from stage 1.
      1: { top: '39.2%', left: '50.5%', width: '54.7%' },
      2: { top: '38.0%', left: '48.4%', width: '47.0%' },
      3: { top: '36.1%', left: '51.0%', width: '50.7%' },
      4: { top: '35.2%', left: '48.4%', width: '48.3%' },
    },
  },
  'accessory-hoodie': {
    z: 10,
    stages: {
      1: { top: '38.1%', left: '50.5%', width: '65.9%' },
      2: { top: '32.0%', left: '48.4%', width: '50.0%' },
      3: { top: '31.1%', left: '50.4%', width: '66.6%' },
      4: { top: '30.6%', left: '47.1%', width: '60.4%' },
    },
  },
};

// Grounds the accessory on the sprite instead of letting it float — the
// PNGs are lit flat and read as stickers without it.
const SHADOW = 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))';

// Gena's gear, in the same coordinate system and measured the same way —
// but ONE entry per accessory rather than four, because her four sprites
// were normalised onto a single canvas (see data/mascots.js). Her tiers
// differ in definition, not in silhouette, so a per-stage table here would
// be four copies of the same numbers pretending to be a calibration.
//
// Landmarks read off gena-goat.png, the same way Jimmy's were:
//
//   eye line 15.7% of canvas height · pupil span 18.5% of canvas width
//   face midline 50.5% · shoulder line 26% · hip 45% · sole 84%
//
// Head and eye pieces are Jimmy's stage-1 numbers converted through pupil
// span — his 16.6% of a 528px canvas against her 18.5% of a 285px one —
// with vertical offsets from the eye line carried across in the SAME
// physical units, which matters here in a way it never did for Jimmy: his
// canvases are all ~0.36:1 while hers is 0.28:1, so a percentage of width
// and a percentage of height do not convert between the two characters at
// the same rate.
//
// Pupil span is the right basis for the SHADES, which sit across the eyes.
// It is the wrong one for the HEADPHONES, and they were shipped too small
// because of it: converted through her narrower eye spacing the cups came
// out at 50% and sat on her cheeks, inside the face, with the ears poking
// out beside them. Head-hugging pieces scale with the head. On Jimmy the
// cups are 1.28x his face width at eye level; her face there is ~46%, so
// 60% — checked side by side with his stage-1 render: cups straddling the
// face edge over the ear roots, band arched over the crown between the
// horns, cup top at the brow and bottom at the nose. `top` then follows
// from holding the band top at ~7% of the canvas, as his is.
//
// The three body/leg pieces are a COMPROMISE and worth knowing about. That
// artwork was cut from Jimmy composites (see accessoryArt.jsx), so it is
// literally a stocky male goat's garment: his jeans are 0.65:1 where her
// hip-to-ankle run wants nearer 0.28:1. Fitting them to her height would
// make them twice as wide as her body, so they are fitted to her WIDTH
// instead — which lands the tank and hoodie correctly and leaves the jeans
// reading as cropped ones that stop below the knee. Gena-cut versions of
// those three are the real fix; nothing in the code changes when they
// arrive beyond the numbers below.
const GENA_ACCESSORY_LAYOUT = {
  'accessory-shades': { top: '15.4%', left: '50.5%', width: '43.0%' },
  'accessory-headphones': { top: '13.5%', left: '50.5%', width: '60.0%' },
  'accessory-cap': { top: '10.8%', left: '50.5%', width: '37.0%' },
  'accessory-tank': { top: '34.8%', left: '50.5%', width: '49.0%' },
  'accessory-hoodie': { top: '37.4%', left: '50.5%', width: '62.0%' },
  'accessory-jeans': { top: '58.0%', left: '50.5%', width: '60.0%' },
};

// Placement is per mascot AND per stage; `z` is neither — the slot stack
// (body behind, lenses in front) is a property of the outfit, not of who
// is wearing it, so it is read from ACCESSORY_LAYOUT either way and two
// head pieces can never argue about order on one character and agree on
// the other.
function layoutFor(itemId, stage, mascotId) {
  const entry = ACCESSORY_LAYOUT[itemId];
  if (!entry) return null;
  const place =
    mascotId === MASCOT_GENA
      ? GENA_ACCESSORY_LAYOUT[itemId]
      : entry.stages[stage] ?? entry.stages[1];
  // A mascot with no entry for this piece wears nothing rather than
  // wearing it in Jimmy's place on a body that is not his.
  if (!place) return null;
  return { ...place, zIndex: entry.z };
}

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
export function AccessoryLayer({
  evolutionStage,
  equippedAccessories = [],
  // Which character the gear is being placed on. Defaults to Jimmy so
  // every existing call site keeps its exact behaviour.
  mascot = DEFAULT_MASCOT_ID,
  depth = 'front',
  className = '',
}) {
  const stage = getTierByStage(evolutionStage)?.stage ?? 1;

  // A mascot with no accessory art of its own wears nothing, whatever the
  // account happens to have equipped.
  //
  // This one line is the enforcement for the whole feature, and it is
  // here rather than at the twelve call sites for the reason the file
  // header already gives about equippedAccessories: a rule applied at call
  // sites is a rule that one forgotten prop undoes, silently, on exactly
  // the screen nobody rechecked. Everything that draws gear — your own
  // avatar, a feed row, a leaderboard row, a friend's profile, a shop
  // card, the evolution crossfade — goes through this component.
  //
  // It hides rather than clears: the ids stay on the account and on every
  // feed post, so switching back to Jimmy puts the outfit straight back on.
  if (!mascotHasAccessories(mascot)) return null;

  // ...and per item, the same way: only what this mascot can wear (the
  // catalog locks Jimmy's garments to him and Gena's sets to her — see
  // mascotCanWear), whatever else is equipped. Filtered before the slot
  // pass, so a hoodie she cannot wear does not even claim its slot. An
  // outfit set passes the filter but has no overlay art, so it draws
  // nothing here: it was already drawn, as the sprite itself.
  const equipped = (
    Array.isArray(equippedAccessories)
      ? equippedAccessories
      : readEquippedAccessories(equippedAccessories)
  ).filter((id) => mascotCanWear(mascot, id));

  // Fixed slot order, not the order things were equipped, so layering is
  // stable: the hoodie paints before the chain that lies on it, and the
  // lenses paint last.
  const behindPass = depth === 'behind';
  const worn = ACCESSORY_SLOT_ORDER.flatMap((slot) => {
    const id = equipped.find((itemId) => ACCESSORY_ART[itemId]?.slot === slot);
    if (!id) return [];
    // NOT plain `stage`: a per-stage garment is a cut of a specific tier
    // of a specific mascot, and the later ones have that mascot baked into
    // them — see accessoryArtStageFor.
    const art = artFor(ACCESSORY_ART[id], accessoryArtStageFor(mascot, stage));
    // The behind pass draws only the pieces that HAVE a back half.
    if (behindPass && !art.behind) return [];
    const place = layoutFor(id, stage, mascot);
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
        style={{ aspectRatio: `${mascotSpriteAspect(mascot, stage)}` }}
      >
        {worn.map(({ id, art, name, place }) => {
          const style = { ...place, transform: 'translate(-50%, -50%)', filter: SHADOW };
          if (!art.src) return null;
          // A piece with a back half is drawn TWICE, once per pass, each time
          // with the other half clipped off. Clipping the same image rather
          // than shipping two files keeps the halves pixel-exact neighbours —
          // any seam would be a hairline of background down Jimmy's chest.
          if (art.behind) {
            const cut = `${art.behind * 100}%`;
            style.clipPath = behindPass ? `inset(0 0 ${100 - art.behind * 100}% 0)` : `inset(${cut} 0 0 0)`;
            // The back half is behind an opaque goat; a shadow on it can only
            // leak out around his edges as a grey halo.
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
  // A live workout streak sets him alight (.streak-fire in index.css).
  //
  // Now the streak LENGTH rather than a boolean, because the aura has
  // three tiers and the component has to know which one to draw. The
  // thresholds still are not decided here — streakAuraClass owns them
  // (utils/streak.js) so the feed, the leaderboard, a friend's profile and
  // your own goat cannot disagree about what "on fire" looks like.
  //
  // Still never read from JimmyLook: every friend's avatar on the
  // leaderboard, the feed and their profile is somebody ELSE's, and a
  // context fallback here would quietly set them alight whenever YOU were
  // on a streak. Same reasoning as equippedAccessories.
  //
  // A boolean is still accepted, and means "tier 1" — a handful of call
  // sites only ever had the pre-derived flag (friendPrivacy.js publishes
  // one), and silently drawing nothing for them would be a worse failure
  // than drawing the modest tier.
  streak = 0,
  // Which character to draw — 'jimmy' (the default) or 'gena'. Same
  // reasoning as equippedAccessories and streak above: NEVER read from
  // JimmyLook, because every avatar on the leaderboard, the feed and a
  // friend's profile belongs to somebody else, and a context fallback here
  // would quietly redraw all of them as your own mascot. The value travels
  // with the row — see friendPrivacy.js and the feedPosts snapshot in
  // functions/economy.js for where it comes from.
  mascot = DEFAULT_MASCOT_ID,
  // Any extra layer to sit under the accessories (the dance animation on
  // WorkoutHome, say) — handed in rather than imported so this stays a
  // pure renderer.
  children,
  alt,
}) {
  const [spriteBroken, setSpriteBroken] = useState(false);
  // An outfit set's file failing is not the same failure as the character
  // failing: drop back to the plain sprite, not to the emoji. The outfit
  // sprites are not in the service worker's precache (vite.config.js) the
  // way the base sprites are, so offline this is the branch that runs.
  const [outfitBroken, setOutfitBroken] = useState(false);
  const tier = getTierByStage(evolutionStage);
  const character = getMascot(mascot);
  // The equipped outfit set's render of this character at this tier, or
  // null for the plain sprite. Same inputs as the accessory layer below,
  // so an outfit on the account draws on every avatar the gear does.
  const outfitSrc = outfitBroken ? null : outfitSpriteFor(mascot, tier?.stage, equippedAccessories);

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
        <AccessoryLayer
          evolutionStage={tier?.stage}
          equippedAccessories={equippedAccessories}
          mascot={mascot}
          depth="behind"
        />
      )}
      {spriteBroken ? (
        <span className="flex h-full items-center justify-center text-[4em] leading-none">
          {character.emoji ?? tier?.emoji ?? '🐐'}
        </span>
      ) : (
        <img
          // The TIER decides the stage, the MASCOT decides whose sprite,
          // and an equipped OUTFIT decides which render of them —
          // tier.image is Jimmy's copy of the same lookup and is left
          // alone so the couple of call sites that legitimately want the
          // franchise goat (the sign-in screen's tier strip) keep working.
          src={outfitSrc ?? mascotSpriteFor(mascot, tier?.stage)}
          alt={alt ?? tier?.label ?? character.name}
          onError={() => (outfitSrc ? setOutfitBroken(true) : setSpriteBroken(true))}
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
        <AccessoryLayer
          evolutionStage={tier?.stage}
          equippedAccessories={equippedAccessories}
          mascot={mascot}
        />
      )}
    </div>
  );

  // The aura is drawn by ::before/::after at inset:-18%, so it has to land
  // on an element that does NOT clip — which is why the cropped branch
  // below grew an extra wrapper instead of just taking the class.
  //
  // Worth knowing at the call sites: a PARENT that clips still wins. The
  // small round avatars are wrapped in GradientBorder's
  // `rounded-full overflow-hidden`, so there the fire reads as a glow
  // banked inside the ring rather than a halo spilling out of it. That is
  // a deliberate accept, not an oversight — punching the aura out through
  // the ring would mean dropping the circular mask that makes those
  // avatars avatars.
  const fireClass = streakAuraClass(streak === true ? FIRE_STREAK_MIN : streak);
  // Tier 3 gets a third, slowly rotating layer that the two pseudo-
  // elements have no room for. Rendered as a real child, so it only exists
  // for the avatars that have earned it rather than sitting invisible
  // behind every other one in the feed.
  const halo = fireClass.includes('--t3') ? <span className="streak-halo" aria-hidden="true" /> : null;

  if (!cropped) {
    return (
      <div
        className={`inline-block ${px == null ? 'h-full' : ''} ${fireClass} ${className}`}
        style={sizeStyle}
      >
        {halo}
        {inner}
      </div>
    );
  }

  return (
    <div className={`${fireClass} ${className}`} style={sizeStyle}>
      {halo}
      <div className="relative h-full w-full overflow-hidden">
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
    </div>
  );
}
