import {
  NOTIFICATION_IDS,
  cancelLocalNotification,
  ensureLocalNotificationPermission,
  isNative,
  scheduleLocalNotification,
} from '../lib/localNotifications';

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
// ── AND THE REAL FIX, IN THE NATIVE SHELL ────────────────────────────────
//
// Inside Capacitor none of the above even gets that far: WKWebView has no
// Notification constructor and no service worker, so every web line below
// is dead code on a phone. It is also where the feature matters most.
//
// So on native this schedules with the OS through
// @capacitor/local-notifications (see lib/localNotifications.js), which
// honours the time whether the app is backgrounded, locked or closed —
// the guarantee the web path openly cannot make. Same three exports, same
// call sites in useRestTimer; the branch lives here and nowhere else.

const TAG = 'rest-over';
const TITLE = 'Rest Time is Up!';
const BODY = 'Get back to work!';

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
  if (isNative()) {
    // Same fire-and-forget contract as the web branch: the OS dialog runs
    // on its own, the timer never waits for the answer.
    ensureLocalNotificationPermission();
    return;
  }
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'default') return;
  Notification.requestPermission().catch(() => {});
}

async function show() {
  if (!canNotify()) return;
  const payload = {
    body: BODY,
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
      await registration.showNotification(TITLE, payload);
      return;
    }
  } catch {
    // Fall through to the page-level constructor.
  }
  try {
    new Notification(TITLE, payload);
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
  if (isNative()) {
    // Handed to the OS, so +30s mid-rest and a restart both just book a
    // new time on the same id. No cancel needed first — scheduling an id
    // that is already pending replaces it — and the queue inside
    // lib/localNotifications.js keeps this in order behind the cancel
    // above, which would otherwise be free to land after it and delete
    // the alert that was just booked.
    scheduleLocalNotification({ id: NOTIFICATION_IDS.restOver, title: TITLE, body: BODY, at: new Date(endsAt) });
    return;
  }
  timeoutId = setTimeout(show, delay);
}

export function cancelRestNotification() {
  if (timeoutId !== null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  // Unconditional: a rest that was skipped, or that ended while the app
  // was being looked at, must take its pending OS alert with it.
  if (isNative()) cancelLocalNotification(NOTIFICATION_IDS.restOver);
}
