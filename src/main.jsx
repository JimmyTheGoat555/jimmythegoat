import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/shared/ErrorBoundary.jsx'

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
if ('serviceWorker' in navigator) {
  registerSW({ immediate: true })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Outermost on purpose: a crash in routing or in App's own top-level
        hooks has to land somewhere other than a blank page. */}
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
