// Easing and timeline arithmetic shared by every animation that is driven
// from a clock rather than a CSS transition — the workout summary card
// (components/workout/AnimatedWorkoutSummary.jsx) and the count-up hooks
// (hooks/useAnimationClock.js).
//
// Why plain functions of `t` and not transitions: a CSS transition owns
// its own timing and can only be watched, never asked "what do you look
// like at 1,340ms". Everything here takes an elapsed time in and hands a
// 0..1 progress out, so one frame of the card is a pure function of one
// number. That is what lets the same card be played live on the phone
// and, later, stepped frame by frame into a canvas for the story sticker.

export const linear = (p) => p;
export const easeOutCubic = (p) => 1 - (1 - p) ** 3;
export const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
// Decelerates hard: most of the distance in the first third, then a long
// settle. The count-up curve — a number that races and then lands.
export const easeOutExpo = (p) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p));
// Overshoots by ~10% before settling. For things that "pop" in.
export const easeOutBack = (p) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
};

export function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function lerp(a, b, p) {
  return a + (b - a) * p;
}

// Linear 0..1 progress of a window that opens at `start` and lasts
// `duration`, clamped: 0 before, 1 after. A zero-length window is a step.
export function phase(t, start, duration) {
  if (duration <= 0) return t >= start ? 1 : 0;
  return clamp01((t - start) / duration);
}

// `phase` run through an easing — the shape most call sites want.
export function eased(t, start, duration, easing = easeOutCubic) {
  return easing(phase(t, start, duration));
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}
