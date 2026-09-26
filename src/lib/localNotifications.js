import { Capacitor } from '@capacitor/core';

// OS-scheduled alerts, for the two things the web platform cannot do:
// fire at an exact future time while the app is closed.
//
// The browser has no primitive for it. showNotification() is immediate
// only, a setTimeout dies with the page, and Periodic Background Sync —
// the one thing that can run code later — is Chrome-on-Android only and
// fires when IT decides, not when we ask. So on the web both callers stay
// best-effort (see their own files); here, on a phone, the OS holds the
// schedule and honours it whether or not the app is running.
//
// Every export is a no-op off native, so callers branch once on isNative()
// and never have to guard again.

// Stable integers, because that is what the plugin keys on. Scheduling
// with an id that already has a pending notification REPLACES it, which
// is what makes "restart the rest timer" a single call rather than a
// cancel and a schedule.
export const NOTIFICATION_IDS = {
  restOver: 1,
  lazyNudge: 2,
};

export function isNative() {
  return Capacitor.isNativePlatform();
}

// Imported lazily so the plugin never lands in the web bundle, the same
// arrangement lib/messaging.js uses for the push plugin.
//
// The `{ }` around the return value is load-bearing. Do not unwrap it.
//
// Returning the plugin BARE from an async function hands it to the promise
// resolution machinery, which reads `.then` off the resolved value to see
// whether it is a thenable it should adopt. A Capacitor plugin is a Proxy
// that answers EVERY property with a native method call, so `.then` comes
// back callable, the bridge dispatches a call to a native method named
// `then`, and iOS answers:
//
//     "LocalNotifications.then()" is not implemented on ios
//
// Two failures out of that one line. The rejection belongs to no one, so it
// surfaces as an unhandled rejection in the console; and because the
// machinery is waiting for a `then` that never calls back, THIS promise
// never settles — every `await plugin()` below waits forever and the
// notification is silently never scheduled. One `{ }` is the fix: an
// ordinary object has no `then`, so the value is adopted as-is.
//
// The web never saw any of it, because isNative() short-circuits in every
// caller before plugin() is reached.
async function plugin() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  return { LocalNotifications };
}

// EVERY OS CALL GOES THROUGH HERE, IN ORDER.
//
// The callers fire these off without awaiting (a rest timer must never
// block on a permission dialog), so two operations on the same id can be
// in flight at once — and a cancel that resolves after the schedule it
// was supposed to precede would silently delete the notification that was
// just booked. One queue makes the order on the OS match the order the
// app asked for. Failures are swallowed rather than allowed to poison the
// chain: a notification that cannot be scheduled is a lost alert, not a
// broken timer.
let queue = Promise.resolve();
function serialize(fn) {
  queue = queue.then(fn).catch(() => {});
  return queue;
}

// Asks once, and only if there is a point in asking. iOS never re-prompts
// after a refusal, so a 'denied' answer is final and worth reporting as
// false rather than firing a dialog that will not appear.
export async function ensureLocalNotificationPermission() {
  if (!isNative()) return false;
  try {
    const { LocalNotifications } = await plugin();
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    if (current.display === 'denied') return false;
    const asked = await LocalNotifications.requestPermissions();
    return asked.display === 'granted';
  } catch {
    return false;
  }
}

// `at` is a Date. `foreground: false` is the important one: iOS would
// otherwise show the banner over the app the user is already looking at,
// which for both callers is the exact moment the alert is redundant —
// the rest timer is already ringing on screen, and someone using the app
// does not need telling they have stopped using it.
export function scheduleLocalNotification({ id, title, body, at, extra = undefined }) {
  if (!isNative()) return Promise.resolve();
  return serialize(async () => {
    const { LocalNotifications } = await plugin();
    await LocalNotifications.schedule({
      notifications: [{ id, title, body, schedule: { at }, foreground: false, extra }],
    });
  });
}

export function cancelLocalNotification(id) {
  if (!isNative()) return Promise.resolve();
  return serialize(async () => {
    const { LocalNotifications } = await plugin();
    await LocalNotifications.cancel({ notifications: [{ id }] });
  });
}
