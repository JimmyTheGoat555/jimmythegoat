import { useEffect, useRef, useState } from 'react';
import { loadJSON, saveJSON } from '../lib/storage';

// Bare key (no uid namespace) to match JimmyEvolution.tsx's sibling
// `last-evolution-tier` — the two track different things (that one drives
// the Progress-tab crossfade, this one is the "have we already thrown
// confetti for this stage" latch) so they get separate keys, but the same
// convention. Known limitation, shared with that file: on a device where
// two accounts are used, the higher-stage account's value suppresses the
// lower one's celebration until it catches up. Not worth uid-namespacing
// just this until multi-account-on-one-device is a real usage pattern.
const CELEBRATED_STAGE_KEY = 'tier-up-celebrated-stage';

// How long each phase of the XP-bar flourish lasts. FILL matches the bar's
// own `transition-all duration-700` in WorkoutHome so the rush to 100%
// actually completes before the hold starts; HOLD is the "let it sit at
// full and feel earned" beat the brief asks for.
const BAR_FILL_MS = 700;
const BAR_HOLD_MS = 500;
// Kept in sync with `.screen-shake`'s animation duration in index.css.
const SHAKE_MS = 900;

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// Watches Jimmy's 1-based `evolutionStage`. The first value it sees is just
// "where this user already is" (persisted, so it survives the reload that
// happens between finishing a workout and landing back on the home
// screen) — only a STRICT increase past the last celebrated stage fires
// the sequence, and it fires exactly once per crossing:
//
//   1. `barOverride` goes 100 -> (hold) -> null. The caller feeds it into
//      the XP bar's width so the bar rushes to full, holds, then snaps
//      back to the real (now much lower) percentage of the new tier.
//   2. a screen-wide, multi-origin canvas-confetti burst (dynamically
//      imported, so the library only loads the first time anyone levels
//      up and never rides in the initial bundle).
//   3. `shaking` is true for the shake keyframe's duration, and
//      navigator.vibrate fires the pattern from the brief.
//
// prefers-reduced-motion is respected: the shake is skipped, confetti is
// handed canvas-confetti's own `disableForReducedMotion`, and the bar
// still fills (that's motion, but not the vestibular-trigger kind). The
// haptic buzz always fires — a vibration isn't screen motion.
export function useTierUpCelebration(stage) {
  const [shaking, setShaking] = useState(false);
  const [barOverride, setBarOverride] = useState(null);
  // Within-mount guard: stops a re-render (or StrictMode's double effect
  // invoke) from firing the same crossing twice before the localStorage
  // write below has visibly "taken".
  const firedForStageRef = useRef(null);

  useEffect(() => {
    if (typeof stage !== 'number' || !Number.isFinite(stage) || stage < 1) return undefined;

    const lastCelebrated = loadJSON(CELEBRATED_STAGE_KEY, null);

    // No stored baseline yet (fresh device, or an account that existed
    // before this feature shipped): adopt the current stage silently so we
    // never celebrate just for opening the app at whatever tier you're
    // already at.
    if (lastCelebrated === null) {
      saveJSON(CELEBRATED_STAGE_KEY, stage);
      return undefined;
    }

    if (stage <= lastCelebrated || firedForStageRef.current === stage) return undefined;

    firedForStageRef.current = stage;
    saveJSON(CELEBRATED_STAGE_KEY, stage);

    const reduced = prefersReducedMotion();
    const timers = [];

    // 3 — haptics.
    navigator.vibrate?.([200, 100, 200, 100, 500]);

    // 2 — confetti.
    import('canvas-confetti')
      .then(({ default: confetti }) => {
        const base = { disableForReducedMotion: true, zIndex: 100, ticks: 260 };
        // A center blast plus two side cannons so it spans the whole
        // screen instead of a single jet from the middle.
        confetti({ ...base, particleCount: 160, spread: 100, startVelocity: 55, origin: { x: 0.5, y: 0.62 } });
        confetti({ ...base, particleCount: 80, angle: 60, spread: 80, origin: { x: 0, y: 0.7 } });
        confetti({ ...base, particleCount: 80, angle: 120, spread: 80, origin: { x: 1, y: 0.7 } });
      })
      .catch(() => {
        // Chunk failed to load (offline, blocked) — the bar + shake +
        // buzz still carry the moment.
      });

    // 1 — XP bar: rush to full, hold, then release back to the true value.
    setBarOverride(100);
    timers.push(setTimeout(() => setBarOverride(null), BAR_FILL_MS + BAR_HOLD_MS));

    // 3 — screen shake, skipped entirely under reduced motion.
    if (!reduced) {
      setShaking(true);
      timers.push(setTimeout(() => setShaking(false), SHAKE_MS));
    }

    return () => timers.forEach(clearTimeout);
  }, [stage]);

  return { shaking, barOverride };
}
