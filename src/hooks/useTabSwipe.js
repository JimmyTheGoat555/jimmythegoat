import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Distance/speed/straightness thresholds for "this was an intentional
// horizontal swipe", not a scroll or a tap. Tuned to feel closer to a
// native card-swipe (Clash Royale's tab bar being the explicit reference)
// than a hair-trigger — a deliberate, fairly fast flick, not a slow drag.
const MIN_DISTANCE_PX = 60;
const MAX_DURATION_MS = 600;
// If the vertical component is more than this fraction of the horizontal
// one, it's a scroll (or a diagonal drag) rather than a swipe — this is
// what lets someone scroll a tab's content without accidentally flipping
// to the next tab.
const MAX_VERTICAL_RATIO = 0.5;

// ── Gestures that belong to something else ──────────────────────────────
//
// MAX_VERTICAL_RATIO above is what keeps a SCROLL from flipping a tab, and
// it works because a scroll is vertical and a tab swipe is horizontal.
// That reasoning runs out the moment a screen contains something that
// scrolls sideways — a card carousel, a chart strip, a row of chips. A
// deliberate horizontal drag across one of those is, by every threshold
// here, a perfect tab swipe: fast, straight, far. So the tab changed under
// the lifter's finger and the row they were actually dragging did not
// move.
//
// The rule is ownership: a gesture that starts inside an element that can
// scroll sideways belongs to that element, and this hook does not get a
// vote on it. Checked at touchstart, against the element the touch landed
// on and its ancestors up to the container.
//
// Unconditional, deliberately — NOT "unless the row is already at its
// end". A rail sitting at its last card would otherwise hand the next
// flick to the tab bar, so the same drag would mean two different things
// depending on a scroll position nobody is looking at. Swiping the page
// around a carousel still works; swiping the carousel only ever moves the
// carousel.
//
// WorkoutCelebration's sticker rail solved this for itself first, by
// stopping propagation on the rail (its comment says the tab used to flip
// under the celebration). That fix stays — it also covers the rail while
// it is LOCKED, when overflow-x is hidden and the test below would say
// "not a scroller" — but no new carousel should have to know this hook
// exists.
//
// A pixel of slop: sub-pixel layout can leave scrollWidth a hair over
// clientWidth on elements that do not actually scroll.
const SCROLL_SLOP_PX = 1;

function ownsHorizontalGesture(target, container) {
  let node = target instanceof Element ? target : null;
  while (node) {
    if (node.scrollWidth > node.clientWidth + SCROLL_SLOP_PX) {
      const { overflowX } = getComputedStyle(node);
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
    if (node === container) return false; // walked the whole way out
    node = node.parentElement;
  }
  return false;
}

// Real-time finger-tracking (the content visually sliding WITH your
// thumb mid-drag, only settling once you lift) would need every tab's
// screen mounted at once side-by-side — a genuinely different app
// structure than "one React Router route renders at a time", and this
// app's tab screens are already fairly heavy (each with its own live
// Firestore listeners lifted to App.jsx). This hook instead detects the
// completed gesture on touchend and then navigates, with index.css's
// .tab-enter-* keyframes (see App.jsx's Layout) giving the incoming
// screen a fast directional slide-in — same visual LANGUAGE as a live
// drag, at a fraction of the architectural cost and risk.
//
// Passive listeners throughout, and preventDefault() is never called —
// vertical scrolling and every existing tap/click target keep behaving
// exactly as before; a swipe that doesn't clear the thresholds above is
// simply a no-op here, not something this hook ever intercepts. Nor is a
// swipe that began inside something that scrolls sideways: this hook
// declines those rather than competing for them (see
// ownsHorizontalGesture).
export function useTabSwipe(tabPaths, containerRef) {
  const location = useLocation();
  const navigate = useNavigate();
  // Read fresh inside the touchend handler without re-subscribing the
  // listeners on every navigation — see the listener effect's deps below.
  // Written from its OWN effect (runs after every render) rather than
  // directly in the render body: mutating a ref during render is a real
  // anti-pattern even when nothing here READS it back mid-render, since a
  // render that gets discarded/retried could otherwise leave the ref
  // holding a value that was never actually committed.
  const stateRef = useRef({ tabPaths, pathname: location.pathname });
  useEffect(() => {
    stateRef.current = { tabPaths, pathname: location.pathname };
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    let touch = null; // { startX, startY, startTime } | null — one in-flight gesture at a time

    function handleTouchStart(e) {
      if (e.touches.length !== 1) {
        // A pinch or some other multi-touch gesture starting mid-swipe —
        // bail rather than guess which finger to keep tracking.
        touch = null;
        return;
      }
      // Started on a carousel, a chart strip, a row of chips — whatever it
      // is, it scrolls sideways and the drag is its own. See
      // ownsHorizontalGesture.
      if (ownsHorizontalGesture(e.target, el)) {
        touch = null;
        return;
      }
      const t = e.touches[0];
      touch = { startX: t.clientX, startY: t.clientY, startTime: Date.now() };
    }

    function handleTouchMove(e) {
      if (touch && e.touches.length !== 1) touch = null;
    }

    function handleTouchEnd(e) {
      const gesture = touch;
      touch = null;
      if (!gesture) return;

      const t = e.changedTouches[0];
      const dx = t.clientX - gesture.startX;
      const dy = t.clientY - gesture.startY;
      const duration = Date.now() - gesture.startTime;

      if (duration > MAX_DURATION_MS) return;
      if (Math.abs(dx) < MIN_DISTANCE_PX) return;
      if (Math.abs(dy) > Math.abs(dx) * MAX_VERTICAL_RATIO) return;

      const { tabPaths: paths, pathname } = stateRef.current;
      const currentIndex = paths.indexOf(pathname);
      if (currentIndex === -1) return; // not currently on an exact tab route (e.g. deep on a trainee's detail page) — nothing to swipe between

      // Swipe left (finger moves toward negative X, content "advances")
      // goes to the NEXT tab, same as Clash Royale/most tab carousels;
      // swipe right goes back. No wraparound past either end.
      const targetIndex = dx < 0 ? currentIndex + 1 : currentIndex - 1;
      if (targetIndex < 0 || targetIndex >= paths.length) return;

      navigate(paths[targetIndex], { state: { navDirection: dx < 0 ? 'forward' : 'backward' } });
    }

    // Named, so it can be removed: an inline handler here was the one
    // listener this hook never took back off the container.
    function handleTouchCancel() {
      touch = null;
    }
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchCancel);
    };
    // containerRef.current is stable for Layout's lifetime and `navigate`
    // is a stable function reference from react-router-dom, so in
    // practice this still only ever attaches once — tabPaths/pathname
    // deliberately come from stateRef instead of being listed here, so a
    // tab switch doesn't tear the listeners down and re-attach them.
  }, [containerRef, navigate]);
}
