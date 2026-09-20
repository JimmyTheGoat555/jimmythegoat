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
