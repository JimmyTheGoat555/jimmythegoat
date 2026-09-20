import { useEffect } from 'react';

// The app's one transient message surface.
//
// Replaces a banner that used to sit in the document flow at the top of
// the page. That banner had three problems, and they are the reasons this
// looks the way it does:
//
//   * it PUSHED the page down when it appeared, so earning coins shoved
//     the whole screen a row lower mid-tap;
//   * it sat at the top, nowhere near the thumb, and had to be dismissed
//     by hitting a small ✕;
//   * it stayed until dismissed, so a stale "+50 coins" could still be on
//     screen two workouts later.
//
// So: fixed rather than in-flow (nothing reflows), anchored bottom just
// above the tab row (where the hand already is), and self-dismissing.
//
// ── Not blocking the UI ─────────────────────────────────────────────────
//
// Nothing here takes pointer events — not the full-width positioning
// wrapper, and not the pill itself. A toast that can be tapped is a toast
// that can intercept the tap meant for whatever it happens to be floating
// over, and since it lets itself out after a few seconds there is nothing
// a tap would need to do anyway. Every press goes straight through to the
// page underneath, including during the seconds the pill is on screen.
//
// ── Where it sits ───────────────────────────────────────────────────────
//
// Above the tab row, and above any other fixed bottom chrome currently on
// screen: the minimised-workout bar (--float-bar-h) and the lobby's Start
// Workout pill (--cta-h). Both are published to :root by their owners via
// hooks/useBottomChrome.js, which exists because this component is mounted
// outside the routed tree and so cannot inherit either value the ordinary
// way. Unset variables resolve to 0px, so on a plain screen this lands
// exactly one small gap above the tab row.

// How long each tone stays up. A warning is the only one that carries
// information the user may need to act on ("that trainer code didn't
// match"), so it gets roughly double the reading time. Success is a
// receipt for something they just did and already expect.
const DISMISS_MS = { success: 3200, warning: 6000 };

// The stack, bottom-up: the tab row, then whichever pieces of fixed bottom
// chrome are live, then a gap. Written as one expression over the shared
// variables rather than a measured number, so raising the nav or the
// workout bar moves the toast with them instead of leaving it overlapping.
const BOTTOM = 'calc(var(--nav-total) + var(--float-bar-h, 0px) + var(--cta-h, 0px) + 0.75rem)';

const TONE = {
  success: 'border-[var(--success)]/35 bg-[color-mix(in_srgb,var(--success)_14%,#0b0a18)] text-[var(--success)]',
  warning:
    'border-[var(--color-state-warning)]/40 bg-[color-mix(in_srgb,var(--color-state-warning)_14%,#0b0a18)] text-[var(--color-gold-200)]',
};

export default function Toast({ notice, onDismiss }) {
  // One timer, restarted whenever a new notice arrives — `notice` is a
  // fresh object at every call site, so a second message replaces the
  // first and gets its own full dwell rather than inheriting what was
  // left of the previous one's.
  useEffect(() => {
    if (!notice) return undefined;
    const ms = DISMISS_MS[notice.tone] ?? DISMISS_MS.success;
    const t = setTimeout(onDismiss, ms);
    return () => clearTimeout(t);
  }, [notice, onDismiss]);

  if (!notice) return null;
  const tone = notice.tone === 'warning' ? 'warning' : 'success';

  return (
    <div className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4" style={{ bottom: BOTTOM }}>
      {/* role=status + aria-live=polite: a screen reader announces this
          when it is idle rather than interrupting, which is right for a
          receipt. `key` remounts the pill for each new message so the
          slide-in actually replays instead of the text swapping silently
          inside a pill that is already resting. */}
      <div
        key={notice.id ?? notice.message}
        role="status"
        aria-live="polite"
        className={`toast-in flex max-w-sm items-center gap-2.5 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-[0_10px_30px_-8px_rgba(0,0,0,0.8)] backdrop-blur-sm ${TONE[tone]}`}
      >
        <span aria-hidden="true">{tone === 'success' ? '🪙' : '⚠️'}</span>
        <p className="min-w-0 flex-1">{notice.message}</p>
      </div>
    </div>
  );
}
