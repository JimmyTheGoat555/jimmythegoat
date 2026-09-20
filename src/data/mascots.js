// Which goat you are. Jimmy is the original; Gena is the second character,
// shown by default to anyone whose onboarding gender is 'female'.
//
// ── WHY `mascot` IS ITS OWN FIELD AND NOT JUST `gender` ──────────────────
//
// The brief was "render Gena if user.gender === 'female'", and that is
// exactly what resolveMascotId does when nothing else has been said. But
// the stored field the renderer reads is `mascot`, not `gender`, for three
// reasons that all bite later:
//
//   1. Settings has a switch. If that switch wrote `gender`, a cosmetic
//      preference would be silently rewriting demographic data that the
//      trainer-side view renders as a fact about the person
//      (utils/onboarding.js's genderLabel), and a user who just wanted the
//      other sprite would show up in their coach's UI as having changed
//      sex.
//   2. GENDERS has three entries, not two — 'other' is a real answer, and
//      it has no mascot of its own. Deriving strictly would force those
//      accounts onto Jimmy with no say.
//   3. Absence is meaningful: it means "never chosen", which is what lets
//      the gender default apply retroactively to every account created
//      before this feature without a migration.
//
// So `gender` is the DEFAULT and `mascot` is the ANSWER. Once a user has
// picked, the pick wins — including picking back to the default.
//
// ── ONE COORDINATE SET, NOT FOUR ─────────────────────────────────────────
//
// Jimmy's four sprites are four different canvases (528-673px wide on a
// ~1466px height) because his silhouette genuinely changes tier to tier,
// which is why ACCESSORY_LAYOUT in JimmyAvatar is per-stage. Gena's four
// were delivered on near-identical proportions — her tiers read as
// definition, not bulk — so all four were normalised onto ONE canvas
// (285x1024) and she needs one set of accessory coordinates rather than
// four. `spriteAspect` and `accessoryLayout` below are therefore plain
// values here where Jimmy's are keyed by stage.
//
// The normalisation also put her on Jimmy's vertical contract — ground
// line at 84.0% of canvas height, body filling 75.5% — which is what lets
// the same pedestal, the same head crop and the same size tokens work for
// both without a single conditional at a call site.

import { getStoreItem, readEquippedAccessories } from './storeItems.js';

export const MASCOT_JIMMY = 'jimmy';
export const MASCOT_GENA = 'gena';
export const DEFAULT_MASCOT_ID = MASCOT_JIMMY;

export const MASCOTS = {
  [MASCOT_JIMMY]: {
    id: MASCOT_JIMMY,
    name: 'Jimmy',
    emoji: '🐐',
    // Per-tier, matching EVOLUTION_TIERS' own `image` field — kept in step
    // with it deliberately rather than imported, so mascots.js has no
    // dependency on the tier table and can be read by the server-side
    // twin (functions/mascots.js) without dragging it along.
    sprites: {
      1: '/assets/jimmy-goat.png',
      2: '/assets/jimmy-buff.png',
      3: '/assets/jimmy-titan.png',
      4: '/assets/jimmy-legend.png',
    },
    // Each mascot serves its clips from its own root, in the same
    // dance{N}/stage{M}.webp layout — utils/danceAnimations.js picks the
    // root from the mascot. Jimmy's are the originals, at the top level.
    danceRoot: '/animations/dances',
    hasDances: true,
    // `wearable: null` means everything the catalogue does not lock to
    // another character (a catalog item's `mascot` field — see
    // mascotCanWear); an array would be a further allowlist on top of
    // that. His garments are locked to him in the catalog, so Gena never
    // gets his hoodie and he never gets her sets, without either of them
    // listing the other's wardrobe here.
    hasAccessories: true,
    wearable: null,
  },
  [MASCOT_GENA]: {
    id: MASCOT_GENA,
    name: 'Gena',
    emoji: '🐐',
    sprites: {
      1: '/assets/gena-goat.png',
      2: '/assets/gena-buff.png',
      3: '/assets/gena-titan.png',
      4: '/assets/gena-legend.png',
    },
    // Her 16 dance clips exist: generated on green screen from her own
    // tier sprites (tools/pad-for-video.mjs), keyed and re-anchored onto
    // the SAME 376x660 canvas as Jimmy's by
    // source-media/pipeline/build_gena.py, and served from `danceRoot`
    // in the same dance{N}/stage{M} layout. utils/danceAnimations.js
    // picks the root from the mascot, so nothing else had to learn that
    // she has her own.
    danceRoot: '/animations/dances/gena',
    //
    // ── HER WARDROBE ────────────────────────────────────────────────────
    //
    // She wears everything the catalog does not lock to Jimmy: the shared
    // head pieces (cap, shades, headphones — his art lands correctly at
    // GENA_ACCESSORY_LAYOUT's coordinates, calibrated from her own
    // landmarks) and her own outfit sets below. His tank, jeans and hoodie
    // carry `mascot: 'jimmy'` in the catalog and so never reach her: they
    // were cut from composites of him, and hoodie-3 and hoodie-4 contain
    // his hooded HEAD — a stocky male goat's clothes on a different body,
    // even placed correctly. mascotCanWear() is the only reader, and
    // AccessoryLayer, the Store shelf and the friend-profile sanitiser all
    // go through it, so an item that is not hers draws nowhere, sells
    // nowhere and is published nowhere — however it got onto the account.
    //
    // Hiding never deletes: `unlockedAccessories` and `equippedAccessories`
    // are left exactly as they are, so a hoodie bought as Jimmy is back on
    // the moment you switch to him in Settings. Nothing here spends or
    // refunds a coin.
    hasDances: true,
    hasAccessories: true,
    wearable: null,
    // ── OUTFIT SETS ─────────────────────────────────────────────────────
    //
    // Her sets are not overlays. Each is a full render of HER in the
    // outfit, one per tier, normalised onto the same 285x1024 canvas as
    // the base sprites by tools/build_gena_outfits.py (same ground line,
    // same body height, same midline — the build prints the match). So an
    // equipped set swaps the sprite wholesale and everything drawn against
    // the sprite's box — the head crop, the pedestal, the shades — lands
    // exactly where it does on the plain sprite. mascotSpriteFor() and
    // outfitSpriteFor() are the readers; JimmyAvatar and JimmyAnimation
    // are the two places a sprite is drawn.
    //
    // Keyed by catalog id (storeItems.js, slot 'outfit'), stage → path,
    // mirroring `sprites` above so the two lookups fall back the same way.
    //
    // What the swap cannot reach is the DANCE: her clips were keyed from
    // the plain sprites, so while a clip plays she dances in her default
    // gear and the set comes back on the sprite the clip settles into —
    // see JimmyAnimation. Sets in the clips means re-rendering them
    // (source-media/pipeline/build_gena.py), 16 per set.
    outfits: {
      'accessory-gena-pink': {
        1: '/assets/outfits/gena-pink-goat.png',
        2: '/assets/outfits/gena-pink-buff.png',
        3: '/assets/outfits/gena-pink-titan.png',
        4: '/assets/outfits/gena-pink-legend.png',
      },
      'accessory-gena-blue': {
        1: '/assets/outfits/gena-blue-goat.png',
        2: '/assets/outfits/gena-blue-buff.png',
        3: '/assets/outfits/gena-blue-titan.png',
        4: '/assets/outfits/gena-blue-legend.png',
      },
      'accessory-gena-yellow': {
        1: '/assets/outfits/gena-yellow-goat.png',
        2: '/assets/outfits/gena-yellow-buff.png',
        3: '/assets/outfits/gena-yellow-titan.png',
        4: '/assets/outfits/gena-yellow-legend.png',
      },
    },
  },
};

// Canvas aspect (width / height) per stage — used by JimmyAvatar's
// AccessoryLayer to rebuild the sprite's own box inside a letterboxing
// square container, which is what makes one set of placement percentages
// serve a 36px leaderboard row and a 208px lobby hero alike.
export const MASCOT_SPRITE_ASPECT = {
  [MASCOT_JIMMY]: { 1: 528 / 1466, 2: 438 / 1467, 3: 552 / 1467, 4: 673 / 1462 },
  // One canvas for all four — see the note above.
  [MASCOT_GENA]: 285 / 1024,
};

export function getMascot(mascotId) {
  return MASCOTS[mascotId] ?? MASCOTS[DEFAULT_MASCOT_ID];
}

// The one place the gender default lives.
//
// Takes either an id string or any document that might carry the fields —
// a user doc, a feed post, a friend summary — because the three of them
// reach the avatar by different routes and none should have to remember
// which key it holds. An unrecognised value falls through to Jimmy rather
// than rendering nothing: a tampered or future id must degrade to a goat,
// not to a blank box.
export function resolveMascotId(source) {
  if (typeof source === 'string') return MASCOTS[source] ? source : DEFAULT_MASCOT_ID;
  if (!source || typeof source !== 'object') return DEFAULT_MASCOT_ID;
  if (MASCOTS[source.mascot]) return source.mascot;
  // Only 'female' maps away from the default. 'other' and an unanswered
  // gender both stay on Jimmy — see reason 2 in the header note.
  if (source.gender === 'female') return MASCOT_GENA;
  return DEFAULT_MASCOT_ID;
}

// Accepts what every avatar call site happens to hold: the equipped array
// itself, or a whole account/post/summary object (readEquippedAccessories
// also tolerates the pre-multi-slot `equippedAccessory` string).
function equippedList(equippedAccessories) {
  return Array.isArray(equippedAccessories) ? equippedAccessories : readEquippedAccessories(equippedAccessories);
}

// The outfit set this mascot is wearing, or null. Last one wins if the
// array somehow holds two — equipAccessory appends, so the last is the
// most recently put on — but the slot rule makes that unreachable from
// the UI. An id the mascot cannot wear (the other character's set, a
// forged one) is not an outfit at all, which is what keeps a Gena set on
// a Jimmy account from ever drawing her sprite as him.
export function equippedOutfitFor(mascotId, equippedAccessories) {
  const outfits = getMascot(mascotId).outfits;
  if (!outfits) return null;
  const ids = equippedList(equippedAccessories);
  for (let i = ids.length - 1; i >= 0; i -= 1) {
    if (outfits[ids[i]] && mascotCanWear(mascotId, ids[i])) return ids[i];
  }
  return null;
}

// The equipped set's sprite at an evolution stage, or null when nothing
// (wearable) is equipped — so a caller can tell "she is in a set" from
// "draw the plain sprite" and fall back to the latter if the set's file
// fails to load (JimmyAvatar does exactly that).
export function outfitSpriteFor(mascotId, stage, equippedAccessories) {
  const outfitId = equippedOutfitFor(mascotId, equippedAccessories);
  if (!outfitId) return null;
  const sprites = getMascot(mascotId).outfits[outfitId];
  return sprites[stage] ?? sprites[1];
}

// Sprite path for a mascot at an evolution stage — the equipped outfit's
// when one is worn, else the plain tier sprite. Falls back to stage 1 the
// same way getTierByStage falls back, so an out-of-range stage draws the
// base character instead of nothing. `equippedAccessories` is optional:
// the couple of call sites that want the character undressed (the
// onboarding preview, the Settings picker's "who you'd be") leave it out.
export function mascotSpriteFor(mascotId, stage, equippedAccessories = []) {
  const outfit = outfitSpriteFor(mascotId, stage, equippedAccessories);
  if (outfit) return outfit;
  const sprites = getMascot(mascotId).sprites;
  return sprites[stage] ?? sprites[1];
}

export function mascotSpriteAspect(mascotId, stage) {
  const entry = MASCOT_SPRITE_ASPECT[mascotId] ?? MASCOT_SPRITE_ASPECT[DEFAULT_MASCOT_ID];
  if (typeof entry === 'number') return entry;
  return entry[stage] ?? entry[1];
}

// Whether this mascot has dance clips of its own. Callers use it to decide
// whether to bother resolving a dance path at all.
export function mascotHasDances(mascotId) {
  return getMascot(mascotId).hasDances === true;
}

// Whether this mascot can wear ANY of the accessory catalogue (per item,
// see mascotCanWear below). Read by
// AccessoryLayer, which is the single choke point every avatar in the app
// draws its gear through — your own, a feed row, a leaderboard row, a
// friend's profile, a shop card. Guarding there rather than at each call
// site is the whole point: a screen that forgets cannot put Jimmy's hoodie
// back on her.
export function mascotHasAccessories(mascotId) {
  return getMascot(mascotId).hasAccessories === true;
}

// Whether this mascot can wear ONE particular item. Two rules, both
// answered here and nowhere else — the renderer, the Store shelf and the
// friend-profile sanitiser all ask this and nothing else:
//
//   1. The catalog's `mascot` field on the item (data/storeItems.js). A
//      piece drawn for one character is that character's: Jimmy's
//      garments are his, Gena's sets are hers, and a piece with no field
//      is shared (the head gear).
//   2. The mascot's own `wearable` list, if it has one — a further
//      allowlist for a character who can only carry part of the shared
//      catalogue. Both current mascots use `null` (no further limit).
//
// An id the catalog does not know is not locked to anyone and so falls
// through to rule 2, the same as before the field existed: a future item
// this build has not heard of draws nothing (AccessoryLayer has no art
// for it) rather than being stripped off the account.
export function mascotCanWear(mascotId, itemId) {
  const mascot = getMascot(mascotId);
  if (mascot.hasAccessories !== true) return false;
  const lockedTo = getStoreItem(itemId)?.mascot;
  if (lockedTo && lockedTo !== mascot.id) return false;
  return mascot.wearable == null || mascot.wearable.includes(itemId);
}

// Whether there is anything in the Store for this mascot at all. The
// catalogue is exactly dances plus accessories (data/storeItems.js), so
// with both off there is nothing to sell.
export function mascotHasCosmetics(mascotId) {
  return mascotHasDances(mascotId) || mascotHasAccessories(mascotId);
}

// Which STAGE of a per-stage accessory's artwork to draw on this mascot —
// which is not always the stage they are on.
//
// The four tanks and the four hoodies are not one garment at four sizes;
// they were each extracted from a composite of Jimmy AT THAT TIER (see
// accessoryArt.jsx), and the later ones have parts of him baked in.
// hoodie-3 and hoodie-4 contain his entire hooded HEAD, deliberately, so
// that on Jimmy the hood reads as shading his face. Drawn on Gena — whose
// torso sits lower and narrower — his face lands on her chest as a second,
// smaller goat looking out of her hoodie. Confirmed in the renderer, not
// predicted: tiers 2, 3 and 4 all showed it.
//
// So a mascot with no garment art of its own is pinned to stage 1, the one
// cut that is a clean garment rather than a garment plus a piece of
// Jimmy — and, not coincidentally, the one GENA_ACCESSORY_LAYOUT was
// calibrated against. Her tiers differ in definition rather than bulk, so
// a single cut fits all four of them anyway.
//
// Those garments now carry `mascot: 'jimmy'` in the catalog and never
// reach her, so today this branch only matters for a SHARED per-stage
// piece — of which there are none (every head piece is one cut for all
// tiers). Kept because the rule is still the right one if such a piece
// is ever added: her clothes are her sets, drawn as whole sprites.
export function accessoryArtStageFor(mascotId, stage) {
  return mascotId === MASCOT_GENA ? 1 : stage;
}

// The two pickable characters, in the order the Settings switch and the
// onboarding preview show them.
export const SELECTABLE_MASCOTS = [MASCOTS[MASCOT_JIMMY], MASCOTS[MASCOT_GENA]];
