import { precacheAndRoute } from 'workbox-precaching';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
import {
  getLazyNudge,
  markLazyNudgeFired,
  LAZY_NUDGE_BODY,
  LAZY_NUDGE_CEILING_MS,
  LAZY_NUDGE_SYNC_TAG,
  LAZY_NUDGE_TAG,
  LAZY_NUDGE_TITLE,
} from './lib/lazyNudge';

// Injected by vite-plugin-pwa's injectManifest strategy at build time —
// the same offline app-shell caching the old generateSW strategy set up
// automatically, just declared explicitly now that this is a hand-written
// service worker (see vite.config.js for why: push notifications need
// code running in the worker, which generateSW has no room for).
precacheAndRoute(self.__WB_MANIFEST);

// Config duplicated from lib/firebase.js rather than imported — a service
// worker has its own separate global scope, but it's still compiled by the
// same Vite bundler (injectManifest processes src/sw.js as a real entry
// point), so import.meta.env.VITE_* is statically replaced here exactly
// like it is in the main app bundle. Written directly instead of shared
// via import just to keep the two files independently reviewable.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

if (firebaseConfig.apiKey && firebaseConfig.messagingSenderId) {
  const app = initializeApp(firebaseConfig);
  const messaging = getMessaging(app);

  // A push that arrives while the app isn't in the foreground (backgrounded
  // tab, or not open at all) — shows a real OS notification. A push that
  // arrives while the app IS open/focused never reaches here; Firebase
  // delivers it to lib/messaging.js's onMessage() in the page itself
  // instead, so the app can show its own in-app toast rather than a native
  // popup stacking on top of a screen already being looked at.
  onBackgroundMessage(messaging, (payload) => {
    const { title, body } = payload.notification ?? {};
    self.registration.showNotification(title ?? 'Jimmy the Goat', {
      body: body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: payload.data ?? {},
    });
  });
}

// Tapping the OS notification focuses/opens the app instead of just
// dismissing it. A notification carrying data.url deep-links there (the
// lazy-goat nudge points at /workout); everything else lands on /.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients[0];
      if (existing) {
        existing.navigate?.(target);
        return existing.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});

// ---- Client-only "lazy goat" re-engagement nudge ----
// See src/lib/lazyNudge.js for why this is best-effort: `periodicsync` is
// the only way to run code on a timer while the PWA is closed, it's
// Chrome-on-Android + installed-PWA only, and the browser — not us —
// decides when it actually fires. So this handler doesn't "wait 71h"; it
// just checks, every time it happens to run, whether the armed nudge is
// now due and hasn't already been shown.
async function maybeShowLazyNudge() {
  if (self.Notification && self.Notification.permission !== 'granted') return;
  const rec = await getLazyNudge();
  if (!rec || rec.fired) return;

  const now = Date.now();
  // Not yet 71h in — or so far past it that the neglect penalty / server
  // tease own this now (see LAZY_NUDGE_CEILING_MS).
  if (now < rec.dueAt || now > rec.lastWorkoutMs + LAZY_NUDGE_CEILING_MS) return;

  await self.registration.showNotification(LAZY_NUDGE_TITLE, {
    body: LAZY_NUDGE_BODY,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: LAZY_NUDGE_TAG,
    data: { url: '/workout' },
  });
  await markLazyNudgeFired();
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === LAZY_NUDGE_SYNC_TAG) event.waitUntil(maybeShowLazyNudge());
});

// A one-shot Background Sync fallback: some builds of Chrome fire a plain
// `sync` on the next connectivity event even when periodicSync isn't
// available, which at least gives the check a chance to run when the
// device comes back online with the app still closed.
self.addEventListener('sync', (event) => {
  if (event.tag === LAZY_NUDGE_SYNC_TAG) event.waitUntil(maybeShowLazyNudge());
});

self.skipWaiting();
self.addEventListener('activate', () => self.clients.claim());
