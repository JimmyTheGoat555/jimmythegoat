import { useCallback, useEffect } from 'react';
import {
  clearLazyNudge,
  setLazyNudge,
  LAZY_NUDGE_BODY,
  LAZY_NUDGE_DELAY_MS,
  LAZY_NUDGE_SYNC_TAG,
  LAZY_NUDGE_TAG,
  LAZY_NUDGE_TITLE,
} from '../lib/lazyNudge';
import {
  NOTIFICATION_IDS,
  cancelLocalNotification,
  ensureLocalNotificationPermission,
  isNative,
  scheduleLocalNotification,
} from '../lib/localNotifications';

// Client-only "lazy goat" nudge. See src/lib/lazyNudge.js for the platform
// constraint spelled out — short version: this fires best-effort via
// Periodic Background Sync on Chrome/Android installed PWAs and not at all
// elsewhere, so it's a bonus on top of (not a replacement for) the server
// job.
//
//   - arm()   — call right after a workout is logged: prompts for
//               notification permission if it hasn't been asked yet,
//               writes the 71h-from-now due time, and registers periodic
//               sync so the service worker gets a chance to fire it.
//   - disarm  — happens automatically on mount and whenever the app is
//               brought to the foreground: the user is here, so cancel
//               anything pending and drop any already-shown nudge.

async function getRegistration() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

async function disarm() {
  if (isNative()) {
    // The OS is holding the only copy, so pulling it is the whole job —
    // no IndexedDB record and no periodic sync exist on this path.
    await cancelLocalNotification(NOTIFICATION_IDS.lazyNudge);
    return;
  }
  await clearLazyNudge();
  const reg = await getRegistration();
  if (!reg) return;
  // Pull down any notification that already fired but hasn't been tapped.
  try {
    const shown = await reg.getNotifications({ tag: LAZY_NUDGE_TAG });
    shown.forEach((n) => n.close());
  } catch {
    // getNotifications unsupported — nothing to clean up.
  }
  // Unregister the periodic-sync wake-up (no-op where it was never
  // supported / never registered).
  try {
    await reg.periodicSync?.unregister(LAZY_NUDGE_SYNC_TAG);
  } catch {
    // ignore
  }
}

async function arm() {
  if (isNative()) {
    // The one place the native shell beats every browser: this is an
    // exact 71-hour appointment the OS keeps with the app closed, rather
    // than the "whenever Chrome next feels like waking the worker, if it
    // is Android, if the PWA is installed" the web path settles for. No
    // IndexedDB record either — nothing reads it here, since there is no
    // service worker to re-check a due time. Scheduling on the same id
    // replaces any nudge from an earlier workout, which is exactly the
    // fresh-clock behaviour the web branch spends two steps on below.
    const granted = await ensureLocalNotificationPermission();
    if (!granted) return;
    await scheduleLocalNotification({
      id: NOTIFICATION_IDS.lazyNudge,
      title: LAZY_NUDGE_TITLE,
      body: LAZY_NUDGE_BODY,
      at: new Date(Date.now() + LAZY_NUDGE_DELAY_MS),
    });
    return;
  }
  if (typeof Notification === 'undefined') return;

  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      // Older Safari throws on the promise form — nothing else to do.
    }
  }
  if (Notification.permission !== 'granted') return;

  // Fresh workout → fresh 71h clock, and any nudge already on screen from
  // a previous dry spell is now stale.
  const reg = await getRegistration();
  if (reg) {
    try {
      const shown = await reg.getNotifications({ tag: LAZY_NUDGE_TAG });
      shown.forEach((n) => n.close());
    } catch {
      // getNotifications unsupported — nothing to clean up.
    }
  }

  await setLazyNudge(Date.now());

  if (!reg?.periodicSync) return; // not Chrome/Android installed PWA — armed record still there for the launch check
  try {
    const status =
      typeof navigator !== 'undefined' && navigator.permissions
        ? await navigator.permissions.query({ name: 'periodic-background-sync' })
        : { state: 'granted' };
    if (status.state !== 'denied') {
      // minInterval is only a hint — the browser fires when IT decides
      // (site engagement, battery, network), typically no more often than
      // every ~12h. The SW handler re-checks the real due time anyway.
      await reg.periodicSync.register(LAZY_NUDGE_SYNC_TAG, { minInterval: 12 * 60 * 60 * 1000 });
    }
  } catch {
    // periodic-background-sync not grantable here — fine.
  }
}

export function useLazyGoatNudge() {
  useEffect(() => {
    disarm();
    const onVisible = () => {
      if (document.visibilityState === 'visible') disarm();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Stable identity so callers can drop it in a dependency array without
  // re-running effects.
  return useCallback(() => {
    arm();
  }, []);
}
