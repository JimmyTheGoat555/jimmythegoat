import { getToken, onMessage } from 'firebase/messaging';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { getMessagingInstance, db } from './firebase';

// ── TWO PATHS, ONE TOKEN COLLECTION ──────────────────────────────────────
//
// Browser: the Firebase JS SDK registers the service worker and hands back
// an FCM registration token.
//
// Native shell (Capacitor): there is no service worker. WKWebView does not
// run one under Capacitor's custom scheme, and the web `Notification` API
// does not exist there either, so every line of the browser path above is
// a dead end inside the app. @capacitor-firebase/messaging wraps the
// FIREBASE iOS SDK and returns the same kind of token the browser path
// does.
//
// That last part is the whole reason this plugin and not @capacitor/push-
// notifications, which is the obvious-looking choice: on iOS that one
// returns the raw APNS device token (its own README says so), and
// sendPushOnNotificationCreate (functions/index.js) sends with
// getMessaging().sendEachForMulticast(), which only accepts FCM
// registration tokens. An APNS token written into users/{uid}/fcmTokens
// would be rejected as messaging/invalid-argument — and that function
// PRUNES tokens on exactly that error, so the device would silently
// unregister itself and no push would ever arrive. Going through the
// Firebase SDK keeps one token format in one collection and leaves the
// server untouched.
//
// The two plugins must not both be installed: they each claim the APNS
// delegate. @capacitor/push-notifications is deliberately absent from
// package.json for that reason.
function isNative() {
  return Capacitor.isNativePlatform();
}

// Imported lazily, and only on the native path, so the Vercel web build
// never pulls the plugin into a bundle that cannot use it.
async function nativeMessaging() {
  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
  return FirebaseMessaging;
}

// One doc id shape for both paths: the token itself, so re-registering the
// same device dedupes on its own.
function tokenDoc(uid, token) {
  return doc(db, 'users', uid, 'fcmTokens', token);
}

// The native half of enablePushNotifications. Permission and token come
// from the OS/Firebase SDK rather than the browser, and the Firestore write
// at the end is byte-for-byte the one the browser path makes, which is what
// lets the Cloud Function stay unaware of where a token came from.
async function enableNativePush(uid) {
  const FirebaseMessaging = await nativeMessaging();
  const { receive } = await FirebaseMessaging.requestPermissions();
  if (receive !== 'granted') return { ok: false, reason: 'Notification permission was not granted.' };
  // No vapidKey here on purpose — that option is web-only. On iOS this
  // resolves once APNS has handed the Firebase SDK a device token, which
  // needs the Push Notifications capability and an APNS key uploaded to
  // the Firebase project. Missing either is what makes this throw.
  const { token } = await FirebaseMessaging.getToken();
  if (!token) return { ok: false, reason: 'Could not get a push token.' };
  await setDoc(tokenDoc(uid, token), {
    createdAt: new Date().toISOString(),
    // Not read by anything today. It is here because the collection now
    // holds tokens from two very different registrations, and the first
    // time one misbehaves the only question worth asking is which kind.
    platform: Capacitor.getPlatform(),
  });
  return { ok: true };
}

// The native half of disablePushNotifications. Drops this device's token
// from the user doc (which is what actually stops the pushes, since the
// Cloud Function only sends to what it finds there) and then retires it
// with Firebase so a stale token is not left alive server-side.
async function disableNativePush(uid) {
  const FirebaseMessaging = await nativeMessaging();
  const { token } = await FirebaseMessaging.getToken();
  if (token) await deleteDoc(tokenDoc(uid, token));
  await FirebaseMessaging.deleteToken();
  return { ok: true };
}

// Requests OS notification permission and registers this browser for push,
// saving the resulting FCM token under the signed-in user so the
// sendPushOnNotificationCreate Cloud Function can find it later
// (functions/index.js). Safe to call repeatedly — the browser's own
// permission prompt only ever shows once per origin; a second call just
// resolves with whatever the user already chose. Doc id is the token
// itself, so re-registering the same device naturally dedupes.
//
// Everything below is wrapped in one try/catch on purpose: a silent
// failure here (button tap, nothing visibly happens — no prompt, no error)
// is worse than any other outcome, so every code path — including ones
// that would otherwise throw an *uncaught* exception on some browsers
// (iOS Safari's PWA/service-worker APIs are more prone to this than
// desktop Chrome) — always resolves to a real { ok, reason } the caller
// can show.
export async function enablePushNotifications(uid) {
  try {
    if (!uid) return { ok: false, reason: 'Not signed in.' };
    if (isNative()) return await enableNativePush(uid);

    const messaging = await getMessagingInstance();
    if (!messaging) return { ok: false, reason: "Push isn't supported on this browser/device." };

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) return { ok: false, reason: "Push isn't configured yet (missing VAPID key)." };

    if (typeof Notification === 'undefined') {
      return { ok: false, reason: "This browser doesn't support notifications." };
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, reason: 'Notification permission was not granted.' };
    }

    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return { ok: false, reason: 'Could not get a push token.' };

    await setDoc(doc(db, 'users', uid, 'fcmTokens', token), { createdAt: new Date().toISOString() });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message ?? 'Something went wrong enabling push.' };
  }
}

// The Settings panel's notifications switch, turned off — removes this
// device's own token so sendPushOnNotificationCreate (functions/index.js)
// simply has nothing to send to here anymore. Doesn't touch the OS-level
// permission (there's no API to revoke that from the page anyway; the
// browser owns it) — just stops this specific device from receiving
// pushes, which is the part actually within the app's control. Same
// belt-and-suspenders full try/catch as enablePushNotifications: a tap
// that visibly does nothing is worse than any other failure mode.
export async function disablePushNotifications(uid) {
  try {
    if (!uid) return { ok: true };
    if (isNative()) return await disableNativePush(uid);

    const messaging = await getMessagingInstance();
    if (!messaging) return { ok: true };
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) return { ok: true };

    const registration = await navigator.serviceWorker.ready;
    // getToken() returns the SAME token this device already registered
    // (Firebase caches it), not a fresh one — no need to look up which
    // one it was.
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (token) await deleteDoc(doc(db, 'users', uid, 'fcmTokens', token));
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message ?? 'Something went wrong disabling push.' };
  }
}

// Messages that arrive while the app is open and focused don't trigger the
// service worker's background handler — Firebase delivers them here
// instead, so the app can show its own in-app toast rather than a native
// OS popup stacking on top of a screen the user is already looking at.
// Returns an unsubscribe function; a no-op one when push isn't supported.
export async function onForegroundMessage(callback) {
  if (isNative()) {
    const FirebaseMessaging = await nativeMessaging();
    const handle = await FirebaseMessaging.addListener('notificationReceived', (event) => {
      // Reshaped into the web SDK's MessagePayload, so a caller written
      // against the browser path reads the same fields on both.
      const n = event?.notification ?? {};
      callback({ notification: { title: n.title, body: n.body }, data: n.data ?? {} });
    });
    return () => handle.remove();
  }
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
}
