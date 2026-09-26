import { useState } from 'react';
import { getTierByStage } from '../../utils/evolutionTiers';
import { ACCESSORY_SLOT_ORDER, getStoreItem, readEquippedAccessories } from '../../data/storeItems';
import { ACCESSORY_ART, artFor } from './accessoryArt';
import { anchorsFor, placeOnAnchors } from '../../data/avatarAnchors';
import {
  DEFAULT_MASCOT_ID,
  accessoryArtStageFor,
  equippedOutfitFor,
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
// Positioning, in one sentence: every piece of gear hangs off a LANDMARK
// of the body it is on. The sprite's landmarks (eye line, crown, neck
// base, hips — per mascot, per tier, per outfit) live in
// data/avatarAnchors.js; how each piece sits relative to its landmark
// lives with the artwork in accessoryArt.jsx (`fit`); AccessoryLayer
// below multiplies the two into CSS percentages of the sprite's own box.
// Nothing here knows a coordinate. Two things make the percentages hold:
//
//   1. The wrapper shrink-wraps the image (`w-auto` + `h-full`), so
//      percentages are relative to the IMAGE box, not a letterboxed
//      container — and where a caller letterboxes, the layer rebuilds
//      the image box from the sprite's aspect (see AccessoryLayer).
//   2. Every sprite is on the same canvas contract — feet at 84% of
//      canvas height (tools/normalize-sprites.mjs) — so the pedestal,
//      the head crop and the dance clips' settled frames all agree on
//      where the character stands.
//
// Accessory artwork is transparent PNG (see accessoryArt.jsx), each piece
// pre-trimmed to its alpha bounds and drawn at its natural aspect, so
// pinning its width alone is what sizes it.
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

// The z-stack per slot — body behind, lenses in front. A property of the
// outfit, not of who is wearing it, so two head pieces can never argue
// about order on one character and agree on the other.
const SLOT_Z = { legs: 5, body: 10, neck: 20, head: 30, eyes: 40 };

// Grounds the accessory on the sprite instead of letting it float — the
// PNGs are lit flat and read as stickers without it.
const SHADOW = 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))';

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

  // The body under the gear: this mascot's landmarks at this tier, in
  // the outfit set they have on (an outfit may move a landmark — see
  // avatarAnchors' `outfits`). No landmarks means no way to place
  // anything honestly, so nothing is drawn.
  const anchors = anchorsFor(mascot, stage, equippedOutfitFor(mascot, equipped));
  if (!anchors) return null;

  // Fixed slot order, not the order things were equipped, so layering is
  // stable: the hoodie paints before the chain that lies on it, and the
  // lenses paint last.
  const behindPass = depth === 'behind';
  const worn = ACCESSORY_SLOT_ORDER.flatMap((slot) => {
    const id = equipped.find((itemId) => ACCESSORY_ART[itemId]?.slot === slot);
    if (!id) return [];
    // NOT plain `stage`: a per-stage garment is a cut of a specific tier
    // of a specific mascot, and the later ones have that mascot baked into
    // them — see accessoryArtStageFor. The PLACEMENT still uses the real
    // stage's landmarks: the cut is chosen for the art, the body is the
    // body.
    const art = artFor(ACCESSORY_ART[id], accessoryArtStageFor(mascot, stage));
    // The behind pass draws only the pieces that HAVE a back half.
    if (behindPass && !art.behind) return [];
    const place = placeOnAnchors(art.fit, anchors, stage);
    if (!place) return [];
    return [{ id, art, name: getStoreItem(id)?.name ?? id, place: { ...place, zIndex: SLOT_Z[slot] ?? 10 } }];
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
  //
  // Resolved BEFORE the fallback flags are applied, because the two flags
  // are about these exact files and have to be forgotten when the files
  // change.
  const outfitFile = outfitSpriteFor(mascot, tier?.stage, equippedAccessories);
  const baseFile = mascotSpriteFor(mascot, tier?.stage);

  // A load failure is a fact about ONE file, not about this component.
  // Both flags latch on error and nothing cleared them, so a single miss —
  // a cache miss offline, a sprite not yet precached — left this avatar
  // showing the emoji for the rest of the session, including after
  // evolving to a tier whose artwork is sitting right there. Anything that
  // changes which file is being asked for clears the verdict on the last
  // one. Compared against the previous render rather than done in an
  // effect: React's own documented way to adjust state when a prop
  // changes, and what useRestTimer already does for its overdue message.
  const look = `${outfitFile ?? ''}|${baseFile ?? ''}`;
  const [prevLook, setPrevLook] = useState(look);
  if (look !== prevLook) {
    setPrevLook(look);
    if (spriteBroken) setSpriteBroken(false);
    if (outfitBroken) setOutfitBroken(false);
  }

  const outfitSrc = outfitBroken ? null : outfitFile;

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
          src={outfitSrc ?? baseFile}
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

  // ── No streak aura ────────────────────────────────────────────────
  //
  // There used to be a three-tier fire aura here (.streak-fire in
  // index.css), drawn behind every avatar whose owner was on a run. It is
  // gone on purpose, everywhere — the lobby goat lost it first, and it
  // survived on friends in the leaderboard, the feed, search results and
  // friend profiles, which is exactly the inconsistency that made it read
  // as a bug rather than a reward. The `streak` prop went with it: an
  // avatar draws a character, and nothing about how often that person
  // trains changes the picture.
  //
  // The streak itself is untouched — it is still counted server-side,
  // still published, and still shown as a number wherever a number
  // belongs. Only the glow is gone.
  if (!cropped) {
    return (
      <div className={`inline-block ${px == null ? 'h-full' : ''} ${className}`} style={sizeStyle}>
        {inner}
      </div>
    );
  }

  return (
    <div className={className} style={sizeStyle}>
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
