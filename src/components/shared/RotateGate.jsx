import { useEffect, useState } from 'react';

// ── Portrait only, on the web too ───────────────────────────────────────
//
// The native builds are locked in Info.plist (UISupportedInterfaceOrientations
// — portrait and nothing else). The web cannot lock anything: the manifest's
// `orientation: 'portrait'` is honoured by installed PWAs on Android and
// ignored by iOS entirely, and the Screen Orientation API's lock() needs
// fullscreen, which Safari does not offer. So a phone held sideways lands on
// a layout that was never designed for a 390px-tall viewport — a sticky
// header, a bottom nav and a rest timer with roughly nothing between them.
//
// This is the fallback: a full-screen, branded "turn it back" over the whole
// app. Deliberately an overlay and not `display: none` on the shell —
// unmounting the app would throw away scroll positions and any half-typed
// set, and the point is that rotating back leaves everything exactly where
// it was.
//
// ── Why this is JavaScript and not a bare media query ───────────────────
//
// `@media (orientation: landscape)` is the obvious way to write this and it
// is wrong here, for two separate reasons:
//
//   1. It is true of every desktop browser ever opened. A laptop is a
//      landscape device and must never see this screen.
//   2. The CSS `orientation` feature only compares viewport width to
//      viewport height — and index.html asks for
//      `interactive-widget=resizes-content`, which SHRINKS the viewport when
//      the soft keyboard opens. Tapping the weight field on a small phone
//      can leave a 390 x 400 viewport, and a hair more keyboard than that
//      flips a portrait phone to "landscape" mid-set. Gating a full-screen
//      takeover on that is a way to make the app unusable for exactly the
//      people using it properly.
//
// So the test below has to satisfy THREE things at once, and each one is
// there to reject a case the others let through:
//
//   1. a touch-only device — a laptop is a landscape machine and must
//      never see this screen, nor must a tablet (checked by the short
//      side of the physical panel; an iPad's is 768 or more);
//   2. a viewport that is wider than tall BY A MARGIN — a real landscape
//      phone sits around 2.2 and never below 1.7, while a portrait one
//      with the keyboard open sits around 0.7 and would need 500px of
//      keyboard on an 812px screen to reach even 1.2, so 1.5 has room on
//      both sides and belongs to neither;
//   3. the DEVICE saying so, via `screen.orientation.type`, which is the
//      one signal the keyboard cannot move.
//
// Neither 2 nor 3 is sufficient alone. Dropping 2 trusts an orientation
// API that can be stale or emulated wrong (a browser emulating a portrait
// phone inside a landscape window reports `landscape-primary` for a
// 375x812 viewport — which is how this was caught). Dropping 3 trusts a
// ratio that a wide phone with a tall keyboard can clear in portrait.
// Together they are only both true when the phone really is on its side.
const PHONE_MAX_SHORT_SIDE = 500;
const LANDSCAPE_RATIO = 1.5;

function isPhoneLandscape() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;

  // 1. Touch-only, and a phone rather than a tablet. `screen` reports the
  //    physical panel, not the keyboard-adjusted viewport.
  if (!window.matchMedia('(hover: none) and (pointer: coarse)').matches) return false;
  const w = window.screen?.width ?? window.innerWidth;
  const h = window.screen?.height ?? window.innerHeight;
  if (Math.min(w, h) > PHONE_MAX_SHORT_SIDE) return false;

  // 2. The viewport is on its side, with room to spare.
  if (window.innerWidth <= window.innerHeight * LANDSCAPE_RATIO) return false;

  // 3. And the device agrees, wherever it can be asked.
  const type = window.screen?.orientation?.type;
  if (typeof type === 'string') return type.startsWith('landscape');
  // Deprecated, but it is what older iOS Safari has: 0/180 portrait,
  // ±90 landscape.
  if (typeof window.orientation === 'number') return Math.abs(window.orientation) === 90;
  return true;
}

// The phone, mid-turn. Inline SVG so it takes the brand colour and needs
// no asset; the animation is the whole message, so it is the one thing
// here that moves.
function RotateIcon() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="rotate-gate-icon h-20 w-20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="20" y="8" width="24" height="44" rx="4" />
      <path d="M28 46h8" />
      <path d="M12 40a22 22 0 0 0 6 10" />
      <path d="M11 32v8h8" />
    </svg>
  );
}

export default function RotateGate() {
  const [blocked, setBlocked] = useState(isPhoneLandscape);

  useEffect(() => {
    const read = () => setBlocked(isPhoneLandscape());
    // `resize` catches the keyboard too, which is exactly why the check
    // above asks the device and not the viewport — it re-reads, and the
    // answer does not change.
    window.addEventListener('resize', read);
    window.addEventListener('orientationchange', read);
    const so = window.screen?.orientation;
    so?.addEventListener?.('change', read);
    return () => {
      window.removeEventListener('resize', read);
      window.removeEventListener('orientationchange', read);
      so?.removeEventListener?.('change', read);
    };
  }, []);

  // Nothing behind this may scroll while it is up — a landscape phone can
  // still flick the app around underneath an overlay otherwise.
  useEffect(() => {
    if (!blocked) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [blocked]);

  if (!blocked) return null;

  return (
    <div className="rotate-gate" role="alertdialog" aria-modal="true" aria-label="Rotate your device to portrait">
      <img className="rotate-gate-mark" src="/newlogo.zozo.png" width="512" height="512" alt="" aria-hidden="true" />
      <RotateIcon />
      <div className="rotate-gate-copy">
        <p className="rotate-gate-title">Please rotate your device</p>
        <p className="rotate-gate-text">Jimmy trains in portrait. Turn your phone upright to continue.</p>
      </div>
    </div>
  );
}
