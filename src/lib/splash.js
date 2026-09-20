// The HTML launch screen in index.html, and the two moments it has to
// survive: React mounting, and the app having nothing to show yet.
//
// adoptSplash() runs before createRoot: a fresh root clears its
// container's children on the first commit, so the splash — authored
// inside #root so it is the launch surface — is lifted out to <body>
// first, where React never looks. dismissSplash() runs from App the
// moment there is a real screen (see the effect there), and from the
// error boundary, so a crash on launch shows the crash and not a spinner
// forever. It is idempotent: whoever calls it first wins, the rest are
// no-ops.
//
// In development, ?splash=hold keeps it up for a look at the design.

const SPLASH_ID = 'splash';
const OUT_CLASS = 'splash--out';
// A shade longer than #splash's CSS transition (0.45s), so the node is
// removed only after it has finished fading.
const FADE_MS = 520;

let splash = null;
let dismissed = false;

export function adoptSplash() {
  const el = document.getElementById(SPLASH_ID);
  if (!el) return;
  if (el.parentElement?.id === 'root') document.body.appendChild(el);
  splash = el;
}

export function dismissSplash() {
  if (dismissed) return;
  dismissed = true;
  // The app's own entrance (index.css: html.app-ready #root) starts on
  // the same frame the splash starts leaving, so the two cross-fade.
  document.documentElement.classList.add('app-ready');
  const el = splash ?? document.getElementById(SPLASH_ID);
  if (!el) return;
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('splash') === 'hold') return;
  el.classList.add(OUT_CLASS);
  window.setTimeout(() => el.remove(), FADE_MS);
}
