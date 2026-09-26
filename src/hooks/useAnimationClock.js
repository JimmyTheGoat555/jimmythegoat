import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../utils/motion';

// A stopwatch that ticks once per painted frame.
//
// `elapsed` is milliseconds since the clock started, re-sampled from the
// wall clock inside requestAnimationFrame and held at `endAt` once it
// gets there. Every consumer derives its state from that one number
// (utils/motion.js's `phase`/`eased`), so a screen animated off this hook
// re-renders exactly once per frame however many things are moving on
// it, and nothing on it can drift out of step with anything else.
//
// Three things it does that a bare rAF loop does not:
//
//   * Reduced motion: `prefers-reduced-motion: reduce` starts the clock
//     AT `endAt`, so the screen renders settled on its first frame and
//     `onEnd` still fires. Callers never have to branch on it.
//   * A hidden page: rAF stops dead while the page is not painted, and
//     the wall clock does not. Left alone, the first frame back would
//     carry the whole absence as one delta — the entire missed sequence
//     to be derived and painted in a single frame, and every beat in it
//     fired at once. So the clock PAUSES while the page is hidden (the
//     loop and its backstop are torn down, with the elapsed time kept)
//     and resumes from that instant on the first frame back: the delta
//     is one frame's worth, never more, and nothing is skipped. A
//     timeout backstop still delivers `endAt` (and `onEnd`) while the
//     page is visible even if a frame never comes, because whatever is
//     waiting on the end must not wait forever.
//   * `seek(ms)` jumps the clock — how a "skip" lands a whole sequence in
//     one frame without every intermediate state flashing past.
//
// `endAt` is required to be finite for `onEnd` to mean anything; an
// open-ended clock (the default) simply never ends.
export function useAnimationClock({ running = true, endAt = Infinity, speed = 1, onEnd } = {}) {
  const [elapsed, setElapsed] = useState(() => (prefersReducedMotion() && Number.isFinite(endAt) ? endAt : 0));
  // Where the current run started (a rAF timestamp) and how much elapsed
  // time was already on the clock when it started — a pause or a seek
  // folds progress into `offset` and re-anchors `origin` on the next frame.
  const originRef = useRef(null);
  const offsetRef = useRef(elapsed);
  const latestRef = useRef(elapsed);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  const seek = useCallback(
    (ms) => {
      const next = Math.max(0, Math.min(endAt, ms));
      offsetRef.current = next;
      latestRef.current = next;
      originRef.current = null;
      setElapsed(next);
    },
    [endAt],
  );

  const done = elapsed >= endAt;

  // Whether the page is on screen — the loop below only runs while it is.
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.visibilityState === 'hidden');
  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!running || done || hidden) return undefined;
    let raf = 0;
    const tick = (now) => {
      if (originRef.current === null) originRef.current = now;
      const next = Math.min(endAt, offsetRef.current + (now - originRef.current) * speed);
      latestRef.current = next;
      setElapsed(next);
      if (next < endAt) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const remaining = (endAt - offsetRef.current) / speed;
    const settle = Number.isFinite(remaining)
      ? setTimeout(() => {
          latestRef.current = endAt;
          setElapsed(endAt);
        }, remaining + 80)
      : null;
    return () => {
      cancelAnimationFrame(raf);
      if (settle) clearTimeout(settle);
      // Whatever was on the clock when this run stopped is where the next
      // one picks up.
      offsetRef.current = latestRef.current;
      originRef.current = null;
    };
    // `done` flips exactly once, at the end; it is in the list so the loop
    // is torn down then rather than scheduling one last empty frame.
    // `hidden` tears it down for the length of the absence and brings it
    // back, re-anchored, on return.
  }, [running, endAt, speed, done, hidden]);

  useEffect(() => {
    if (done && Number.isFinite(endAt)) onEndRef.current?.();
  }, [done, endAt]);

  return { elapsed, done, seek };
}
