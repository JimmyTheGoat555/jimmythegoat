import { useCallback, useEffect, useRef, useState } from 'react';

// Keeps the screen from auto-locking mid-set. Wraps the Screen Wake Lock API
// with the two gotchas that actually matter in a gym: the browser silently
// drops the lock whenever the tab is hidden (phone screen-off, app switch),
// and it isn't re-acquired automatically when the tab comes back — so we
// listen for visibilitychange and re-request it ourselves.
export function useWakeLock() {
  const sentinelRef = useRef(null);
  const [isActive, setIsActive] = useState(false);
  const wantsLockRef = useRef(false);

  const request = useCallback(async () => {
    wantsLockRef.current = true;
    if (!('wakeLock' in navigator) || sentinelRef.current) return;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      sentinelRef.current = sentinel;
      setIsActive(true);
      sentinel.addEventListener('release', () => {
        sentinelRef.current = null;
        setIsActive(false);
      });
    } catch {
      // Refused (low battery, unsupported browser, tab already hidden) —
      // the workout still works fine, the screen just might dim on its own.
      sentinelRef.current = null;
      setIsActive(false);
    }
  }, []);

  const release = useCallback(async () => {
    wantsLockRef.current = false;
    try {
      await sentinelRef.current?.release();
    } catch {
      // Already released or unsupported — nothing to clean up.
    } finally {
      sentinelRef.current = null;
      setIsActive(false);
    }
  }, []);

  // Re-acquire on return to the tab if we still want the lock held.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && wantsLockRef.current && !sentinelRef.current) {
        request();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [request]);

  // Safety net: release if the component tree using this hook ever unmounts
  // mid-workout (e.g. a full page unload skips this, the browser handles it).
  useEffect(() => {
    return () => {
      sentinelRef.current?.release().catch(() => {});
    };
  }, []);

  return { isActive, request, release };
}
