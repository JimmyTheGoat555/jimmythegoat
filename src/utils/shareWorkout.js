import { renderWorkoutStickerFile } from './workoutSticker';

// Getting the sticker (utils/workoutSticker.js) into a story.
//
// ── COPY ────────────────────────────────────────────────────────────────
//
// A web app cannot open Instagram's story composer with an image the way
// a native app can, and the iOS share sheet does not put Instagram
// anywhere useful even when the payload is a bare image file. What DOES
// work, on every phone, is the clipboard: copy the transparent PNG, open
// a story, tap the text tool, tap Paste, and the sticker lands on top of
// whatever photo is already there. That is the one path here —
// `copyWorkoutSticker` — and it is deliberately the same trick Strava's
// own "copy to clipboard" share uses.
//
// (A share sheet with a download behind it, and a recorded clip of the
// sticker, sat beside the copy for a while; both were cut. Two more
// buttons under the one that works only made the working one harder
// to find.)
//
// ── TIMING ──────────────────────────────────────────────────────────────
//
// Safari only honours navigator.clipboard.write() when it is called in
// the tap itself, not after an await. So copyWorkoutSticker is NOT async:
// it builds the ClipboardItem synchronously and, if the PNG is still
// being rendered, hands the clipboard a promise of it — the one shape
// Safari accepts for exactly this reason. Callers should pass the
// pre-rendered `sticker` (a File, or the promise of one) whenever they
// have it; WorkoutCelebration renders the moment the card finishes.
//
// Outcome, for the button and the toast:
//   'copied' | 'failed' | 'unsupported'

export function canCopyImages() {
  return (
    typeof navigator !== 'undefined' &&
    typeof ClipboardItem !== 'undefined' &&
    typeof navigator.clipboard?.write === 'function'
  );
}

// Resolves whatever the caller passed as `sticker` — a File, a promise of
// one (possibly of null, if the pre-render failed), or nothing — to a
// promise of a PNG Blob, rendering it if there is nothing to use.
function stickerBlob({ sticker, ...renderOptions }) {
  const source = sticker ?? renderWorkoutStickerFile(renderOptions);
  return Promise.resolve(source).then((file) => {
    if (!(file instanceof Blob)) throw new Error('No sticker to copy.');
    return file;
  });
}

// Copies the sticker to the clipboard. Call it synchronously from the tap
// handler (see TIMING). Returns a promise of the outcome.
export function copyWorkoutSticker(options = {}) {
  if (!canCopyImages()) return Promise.resolve('unsupported');
  const { sticker } = options;
  // A Blob in hand goes straight in; anything else rides in as a promise
  // so the write itself still happens inside the gesture.
  const png = sticker instanceof Blob ? sticker : stickerBlob(options);
  let item;
  try {
    item = new ClipboardItem({ 'image/png': png });
  } catch {
    return Promise.resolve('failed');
  }
  return navigator.clipboard.write([item]).then(
    () => 'copied',
    () => 'failed',
  );
}
