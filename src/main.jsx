import * as Sentry from '@sentry/capacitor'
import * as SentryReact from '@sentry/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/shared/ErrorBoundary.jsx'
import RotateGate from './components/shared/RotateGate.jsx'
import PublicInfoRoutes from './components/legal/PublicInfoRoutes.jsx'
import { adoptSplash } from './lib/splash.js'
import { isStaleBuildError } from './utils/staleBuild.js'

// Crash and error reporting, started before anything below it can throw.
//
// Two SDKs, one call: @sentry/capacitor owns the native iOS layer and takes
// the web SDK's own init as its second argument. Their versions are an EXACT
// peer pin, not a range — capacitor 4.4.0 wants react 10.69.0 and nothing
// else. Mismatch them and you get two Sentry clients with events going to
// neither, and nothing anywhere to say so; `npm ls @sentry/core` printing one
// deduped version is the check.
//
// No DSN means no reporting and no errors, which is what a bare `npm run dev`
// and a clone without the secret should both do.
Sentry.init(
  {
    dsn: import.meta.env.VITE_SENTRY_DSN,
    // Injected by vite.config.js from the commit SHA, and the same name the
    // source maps are uploaded under. If the two ever drift apart, every
    // stack trace in the dashboard stays minified and useless.
    release: import.meta.env.VITE_RELEASE,
    environment: import.meta.env.MODE,
    // Errors only to begin with. Tracing is a separate quota and a separate
    // decision; turning it on later is this one number.
    tracesSampleRate: 0,
    // No IP address, no cookies, no request bodies. The only identifier
    // attached is the Firebase uid, set deliberately in hooks/useAuth.js.
    sendDefaultPii: false,
    beforeSend(event) {
      // A stale-build chunk error heals itself: ErrorBoundary reloads once
      // and the new build is already sitting there. Left in, they would bury
      // every real crash under them on every deploy day. The ones that come
      // back AFTER that reload are a different thing — the new build is
      // broken too, or the service worker is wedged — so ErrorBoundary tags
      // those and they pass.
      const thrown = event.exception?.values?.[0]
      const stale = isStaleBuildError({ name: thrown?.type, message: thrown?.value })
      return stale && event.tags?.survivedReload !== 'yes' ? null : event
    },
  },
  SentryReact.init,
)

// Registers the service worker AND — because vite.config.js sets
// registerType: 'autoUpdate' — reloads the page the moment a new version
// takes over. Without calling this ourselves (see vite.config.js's
// injectRegister: null), the plugin falls back to a bare
// `navigator.serviceWorker.register()` with no update handling at all: a
// tab or installed PWA left open across a deploy would keep running old
// page code under a freshly-activated service worker whose precache no
// longer has the old build's hashed asset files — the leading suspect for
// reports of the app going blank on iPhone, and directly reproduced once
// as a stale build still showing the long-removed "Kid Goat" tier.
// How often an already-open app asks whether a new build exists. `autoUpdate`
// only CHECKS on page load, which is fine in a browser tab and useless in an
// installed PWA: iOS keeps those suspended for days rather than reloading
// them, so a deploy can land and the user carries on looking at the old
// bundle with no way to know. Reported live — a removed shop item still
// showing after it had been deleted and deployed.
const UPDATE_CHECK_MS = 60 * 60 * 1000
// Not more often than this on foreground/online, however many times the
// app is flipped to and from. A check is a fetch of sw.js and, when a
// build has shipped, the download of the whole new precache — not what
// the first frames back from the background should be spent on.
const UPDATE_CHECK_MIN_GAP_MS = 10 * 60 * 1000

if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      let lastCheckAt = 0
      const check = () => {
        // Only when the app is actually on screen; polling a backgrounded
        // PWA wakes the radio for nothing.
        if (document.visibilityState !== 'visible') return
        const now = Date.now()
        if (now - lastCheckAt < UPDATE_CHECK_MIN_GAP_MS) return
        lastCheckAt = now
        registration.update().catch(() => {})
      }
      setInterval(check, UPDATE_CHECK_MS)
      // The important one on mobile: coming back to a suspended app is the
      // moment it has been away longest and is most likely to be stale.
      document.addEventListener('visibilitychange', check)
      window.addEventListener('online', check)
    },
  })
}

// Before the root is created — see src/lib/splash.js for why the launch
// screen has to leave #root before React's first commit.
adoptSplash()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Outermost on purpose: a crash in routing or in App's own top-level
        hooks has to land somewhere other than a blank page. */}
    <ErrorBoundary>
      {/* Above everything and outside the router: a phone held sideways
          gets the same answer on the sign-in screen, on /privacy and
          mid-workout. See components/shared/RotateGate.jsx — it is a
          no-op on tablets and on every desktop. */}
      <RotateGate />
      <BrowserRouter>
        {/* /privacy, /terms and /support render here INSTEAD of App — the
            URLs App Store Connect is given have to work with no account
            and no app boot. Everything else falls through to App. */}
        <PublicInfoRoutes>
          <App />
        </PublicInfoRoutes>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
