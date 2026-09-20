// Runs `fn` once the main thread has a quiet moment — after the current
// frame's paint, not in it — with a ceiling so it always runs within
// `timeout` ms even on a busy thread. Safari has no requestIdleCallback,
// so there it is "two frames from now", which is the same promise in
// practice: not this frame. Returns a cancel function.
export function whenIdle(fn, { timeout = 250 } = {}) {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(() => fn(), { timeout });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 32);
  return () => clearTimeout(id);
}
