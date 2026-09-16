import { useEffect, useState } from 'react';

// How many pixels of the layout viewport the software keyboard is
// currently covering.
//
// The problem this solves: a bottom sheet is anchored to the bottom of the
// screen, and on iOS the soft keyboard slides over the page without
// resizing it — `window.innerHeight` doesn't change, no resize event
// fires, and the sheet's own footer (the "Add" button, the text field it
// belongs to) is left sitting underneath the keys. Android Chrome behaves
// better with `interactive-widget=resizes-content` on the viewport meta
// tag (index.html), but iOS ignores that, so the real occluded height has
// to be measured.
//
// visualViewport is what actually moves: `vv.height` shrinks to the part
// of the page still visible above the keyboard, and `vv.offsetTop` covers
// the case where the browser also scrolls the page up to reveal the
// focused field. Whatever is left over is the keyboard.
//
// Returns 0 when no keyboard is up, on desktop, and in the handful of
// environments with no visualViewport at all — so a caller can add it as
// padding unconditionally and get exactly today's layout when it's zero.
export function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const sync = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    // Run once on mount: a sheet can open while the keyboard is ALREADY up
    // (tapping "+ Custom exercise" from a screen with a focused field),
    // and no event fires for a keyboard that never moved.
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, []);

  return inset;
}
