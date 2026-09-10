import { getToken, onMessage } from 'firebase/messaging';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { getMessagingInstance, db } from './firebase';

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
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
}
