import { STORE_ITEMS } from '../data/storeItems';
import { DEFAULT_MASCOT_ID, getMascot, mascotHasDances } from '../data/mascots';

// {danceRoot}/dance{1..4}/stage{1..4}.webp — 4 dances x 4 evolution
// stages, PER MASCOT: Jimmy's at /animations/dances, Gena's in the same
// shape under /animations/dances/gena (data/mascots.js `danceRoot`). Both
// `danceId` and `evolutionStage` are the 1-based numbers straight out of
// the folder/file names — see data/storeItems.js's `videoDanceNumber` and
// evolutionTiers.js's `stage` for where callers get them from.
//
// The mascot is an argument to both resolvers, and a mascot with no clips
// of its own gets null rather than a path. That is the guarantee that
// matters: a call site cannot hand JimmyAnimation the other character's
// dance by forgetting to pass one — the default is Jimmy, whose clips
// exist, and the component refuses a clip for a mascot without them
// anyway.
//
// Animated WebP rather than the MP4s these were delivered as: H.264 cannot
// carry an alpha channel, so the source clips had their transparency
// flattened into a visible checkerboard behind Jimmy. WebP is the only
// format with real alpha that plays everywhere the app runs, iOS Safari
// included. The clips are re-keyed and re-anchored offline (all 16 share one
// canvas, one character height and one ground line) so this stays a plain
// path lookup — see source-media/README.md.
//
// Not every combination exists: a clip whose source was unusable simply has
// no file, and JimmyAnimation falls back to the static sprite on load error.
export function getDanceAnimationPath(danceId, evolutionStage, mascotId = DEFAULT_MASCOT_ID) {
  if (!danceId || !evolutionStage || !mascotHasDances(mascotId)) return null;
  return `${getMascot(mascotId).danceRoot}/dance${danceId}/stage${evolutionStage}.webp`;
}

// Store-card sized copies of the same clips: cropped to the character and
// scaled down, because the shop shows four at once and the hero files are
// built for the much larger pedestal display. See
// source-media/pipeline/make_previews.py (build_gena.py for Gena's).
export function getDancePreviewPath(danceId, evolutionStage, mascotId = DEFAULT_MASCOT_ID) {
  if (!danceId || !evolutionStage || !mascotHasDances(mascotId)) return null;
  return `${getMascot(mascotId).danceRoot}/preview/dance${danceId}/stage${evolutionStage}.webp`;
}

// Resolves a store item id (e.g. account.equippedDance) to its animation
// folder number. Returns null for no item equipped, an accessory id (only
// dances animate), or an id that's somehow not in the catalog.
export function danceNumberForItemId(itemId) {
  if (!itemId) return null;
  return STORE_ITEMS.find((item) => item.id === itemId)?.videoDanceNumber ?? null;
}
