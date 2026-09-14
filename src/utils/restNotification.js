// "Rest is over" as a system notification, for when the phone is face-down
// or locked and no sound is going to reach anybody.
//
// ── WHAT THIS CAN AND CANNOT DO ──────────────────────────────────────────
//
// Be precise about this, because the difference decides whether the
// feature is trusted: a WEB page cannot schedule a notification for a
// future time. There is no API for it that any iOS browser supports —
// Notification Triggers exist only in Chromium behind a flag. What we
// have is a setTimeout, and a backgrounded page's timers are throttled
// and, if the tab is discarded, never run at all.
//
// So this is best-effort with a safety net:
//
//   * the timeout fires the notification if the page is still alive,
//     which covers the common case of the phone sitting on a bench with
//     the app open behind the lock screen;
//   * and whatever happens, the timer itself stays correct, because it is
//     derived from an absolute timestamp (useRestTimer) rather than
//     counted down — so returning to the app shows the right time and
//     fires the alert immediately if it was missed.
//
// ── THE REAL FIX, WHEN THE APP IS WRAPPED ────────────────────────────────
//
// @capacitor/local-notifications schedules against the OS, which honours
// it whether or not the app is running:
//
//   import { LocalNotifications } from '@capacitor/local-notifications';
//   await LocalNotifications.schedule({
//     notifications: [{
//       id: REST_NOTIFICATION_ID,
//       title: "Rest's over",
//       body: 'Time for your next set.',
//       schedule: { at: new Date(endsAt) },
//     }],
//   });
//   // and LocalNotifications.cancel({ notifications: [{ id }] }) on skip.
//
// That is a drop-in replacement for the two functions below — same call
// sites, same ids — so the swap is this file and nothing else.

const TAG = 'rest-over';

let timeoutId = null;

function canNotify() {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

// Asked at the moment a rest starts rather than on app launch: a
// permission prompt makes sense next to the thing that needs it, and a
// cold "allow notifications?" on first open is the dialog everybody
// refuses out of habit.
//
// Deliberately fire-and-forget — the rest timer must never wait on a
// permission dialog, and a refusal costs only the background alert.
export function askRestNotificationPermission() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'default') return;
  Notification.requestPermission().catch(() => {});
}

async function show() {
  if (!canNotify()) return;
  const payload = {
    body: 'Time for your next set.',
    tag: TAG,
    // Replaces rather than stacks, so a missed one plus a new one is never
    // two notifications about the same rest.
    renotify: true,
    icon: '/assets/jimmy-goat.png',
    badge: '/assets/jimmy-goat.png',
    vibrate: [200, 100, 200],
  };
  try {
    // Through the service worker where there is one: Android Chrome
    // refuses `new Notification()` from a page, and the SW copy also
    // survives the page being hidden.
    const registration = await navigator.serviceWorker?.ready;
    if (registration?.showNotification) {
      await registration.showNotification("Rest's over 🐐", payload);
      return;
    }
  } catch {
    // Fall through to the page-level constructor.
  }
  try {
    new Notification("Rest's over 🐐", payload);
  } catch {
    // Nothing more to try. The in-app alarm still fires the moment the
    // app is looked at again.
  }
}

// Schedules the alert for `endsAt` (epoch ms). Replaces any pending one.
export function scheduleRestNotification(endsAt) {
  cancelRestNotification();
  const delay = endsAt - Date.now();
  if (delay <= 0) return;
  timeoutId = setTimeout(show, delay);
}

export function cancelRestNotification() {
  if (timeoutId !== null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
}
