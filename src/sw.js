import { precacheAndRoute } from 'workbox-precaching';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

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
// dismissing it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('/');
    }),
  );
});

self.skipWaiting();
self.addEventListener('activate', () => self.clients.claim());
