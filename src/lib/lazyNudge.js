// Shared state for the client-only "lazy goat" re-engagement nudge, used
// by BOTH the page (src/hooks/useLazyGoatNudge.js) and the service worker
// (src/sw.js) — hence a tiny raw-IndexedDB store rather than localStorage
// (a worker can't see localStorage) and zero references to `window` /
// `document` (this module is bundled into sw.js too).
//
// IMPORTANT CONSTRAINT: the web platform has no API to fire a notification
// at an exact future time while the app is closed. `showNotification` is
// immediate-only (the `showTrigger`/`TimestampTrigger` proposal never
// shipped to a stable browser), and a `setTimeout` in a service worker is
// killed with the worker within ~30s. The only primitive that can run
// code later while the PWA is closed is Periodic Background Sync, which is
// Chrome-on-Android + installed-PWA only and whose cadence the browser
// controls (roughly every 12h+, never a precise "71 hours"). So this
// nudge is best-effort: it fires the first time the SW happens to wake up
// after the 71h mark, on the platforms that support that, and does
// nothing at all on iOS Safari / Firefox / desktop Safari. The Cloud
// Function (functions/index.js's teaseLazyGoats) is the only reliable
// cross-platform version.

// 71h, per the brief — one hour inside the 72h/3-day line so the tease
// lands just before it, not on it.
export const LAZY_NUDGE_DELAY_MS = 71 * 60 * 60 * 1000;
// Past this point the neglect penalty + (if deployed) the server tease
// have taken over; a stale local nudge firing on day 6 would just be
// noise, so the SW suppresses it.
export const LAZY_NUDGE_CEILING_MS = 5 * 24 * 60 * 60 * 1000;

// One notification tag so a newer nudge always replaces an older one
// rather than stacking, and so the page can target it for clearance.
export const LAZY_NUDGE_TAG = 'lazy-goat-nudge';
// Periodic Background Sync registration tag (Chrome/Android installed PWA).
export const LAZY_NUDGE_SYNC_TAG = 'lazy-goat-nudge';

export const LAZY_NUDGE_TITLE = 'Jimmy is judging you. 🐐';
export const LAZY_NUDGE_BODY =
  '71 hours without lifting? You are officially a lazy goat. Get off the couch and go train!';

const DB_NAME = 'jimmy-goat-lazy-nudge';
const STORE = 'kv';
const KEY = 'state';

function openDb() {
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      // `fn` returns the IDBRequest; its `.result` is the value for get()
      // (the written key for put()/delete(), which callers ignore).
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Shape: { lastWorkoutMs: number, dueAt: number, fired: boolean } | null.
export async function getLazyNudge() {
  try {
    return (await withStore('readonly', (store) => store.get(KEY))) ?? null;
  } catch {
    // Private mode / IndexedDB blocked — the nudge just doesn't work here.
    return null;
  }
}

// Arms (or re-arms) the nudge for a workout that just finished at `nowMs`.
export async function setLazyNudge(nowMs = Date.now()) {
  try {
    await withStore('readwrite', (store) =>
      store.put({ lastWorkoutMs: nowMs, dueAt: nowMs + LAZY_NUDGE_DELAY_MS, fired: false }, KEY),
    );
  } catch {
    // ignore — see getLazyNudge
  }
}

// Marks the current record as already shown, so a later SW wake-up doesn't
// re-fire it for the same dry spell.
export async function markLazyNudgeFired() {
  try {
    const current = await getLazyNudge();
    if (!current) return;
    await withStore('readwrite', (store) => store.put({ ...current, fired: true }, KEY));
  } catch {
    // ignore
  }
}

// Disarms — the user came back (opened the app), so nothing is pending.
export async function clearLazyNudge() {
  try {
    await withStore('readwrite', (store) => store.delete(KEY));
  } catch {
    // ignore
  }
}
