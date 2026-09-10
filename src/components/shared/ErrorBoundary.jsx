import { Component } from 'react';

// A crash used to mean a blank white screen: no message, no way back, and
// nothing in the UI to say whether the app was broken or just slow. This is
// the net under all of it — see main.jsx, where it wraps the whole tree.
//
// The chunk-load case gets its own treatment on purpose. This app has a
// documented history of going blank on iPhone (see main.jsx and
// vite.config.js) when a tab left open across a deploy ends up running old
// page code whose hashed asset files the new build no longer has. Route
// splitting makes that MORE likely, not less: a lazily imported screen is
// fetched at the moment it's opened, so an open tab that survives a deploy
// hits it the first time someone taps a tab. That failure is fixable
// without the user understanding any of it — the new build is sitting right
// there — so we just reload once, silently.
//
// Once, though. A reload that doesn't fix it would otherwise become an
// infinite refresh loop, which is a worse failure than the blank screen it
// replaced. sessionStorage (not local) so the guard clears with the tab.
const RELOAD_GUARD = 'jimmy:chunk-reload-attempted';

function isStaleBuildError(error) {
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`;
  // Wording differs per browser, and Vite's CSS preload failure is the
  // same stale-build class as a missing JS chunk — all verified against the
  // real strings Chrome, Firefox, Safari and Vite actually throw.
  return /loading chunk|dynamically imported module|importing a module script failed|failed to fetch dynamically|unable to preload/i.test(
    text,
  );
}

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (isStaleBuildError(error) && !sessionStorage.getItem(RELOAD_GUARD)) {
      sessionStorage.setItem(RELOAD_GUARD, '1');
      window.location.reload();
      return;
    }
    // Nothing collects these yet — wiring an error reporter in is a pending
    // pre-launch item — so at least leave something in the console rather
    // than swallowing the one description of what went wrong.
    console.error('Unhandled error in render:', error);
  }

  // Last resort for a browser stuck on a half-updated build: drop the
  // service worker and its precache, so the next load has to come from the
  // network. Exactly the state that produced the original iPhone reports.
  handleHardReload = async () => {
    try {
      if ('caches' in window) {
        await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        await Promise.all(
          (await navigator.serviceWorker.getRegistrations()).map((r) => r.unregister()),
        );
      }
    } catch {
      // Best-effort: if the browser blocks either of these, the plain
      // reload below is still worth trying.
    }
    sessionStorage.removeItem(RELOAD_GUARD);
    window.location.replace('/');
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center gap-4 bg-neutral-950">
        <span className="text-5xl">🐐</span>
        <h1 className="text-2xl font-bold text-neutral-50">Jimmy tripped over something</h1>
        <p className="text-neutral-400 max-w-sm">
          Something in the app crashed. Your workouts are saved — nothing was lost.
        </p>
        <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="bg-[var(--ember)] text-white font-semibold text-base py-3 rounded-xl"
          >
            Reload the app
          </button>
          <button
            type="button"
            onClick={this.handleHardReload}
            className="text-sm text-neutral-500 py-2"
          >
            Still broken? Reset and start fresh
          </button>
        </div>
      </div>
    );
  }
}
