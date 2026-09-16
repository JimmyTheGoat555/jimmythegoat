import { useEffect, useRef, useState } from 'react';
import { loadJSON, saveJSON, storageKeyFor } from '../lib/storage';

// Generic persisted-state hook: behaves like useState but every value is
// mirrored into localStorage under `storageKey`.
//
// `storageKey` can change at runtime — every caller in this app now
// namespaces it by uid (e.g. `active-workout:${uid}`) so a second account
// signed in on the same browser doesn't see the first account's data. But
// `useState`'s lazy initializer only ever runs on first mount, and `App`
// itself never remounts when a different account signs in — it just
// re-renders with a new `uid`. Without the check below, the in-memory
// `value` from account A would sit there unchanged, and the save effect
// would dutifully write it under account B's brand-new key the instant
// they sign in: a subtler version of the exact cross-account leak the
// namespacing was meant to fix. So: when `storageKey` itself changes,
// re-hydrate from the NEW key's own storage instead of persisting the old
// key's leftover value onto it.
export function useLocalStorage(storageKey, initialValue) {
  const [value, setValue] = useState(() => loadJSON(storageKey, initialValue));
  const prevKeyRef = useRef(storageKey);

  useEffect(() => {
    if (prevKeyRef.current !== storageKey) {
      prevKeyRef.current = storageKey;
      setValue(loadJSON(storageKey, initialValue));
      return; // don't also save this render — it holds the OLD key's value
    }
    saveJSON(storageKey, value);
    // initialValue is intentionally not a dependency — it's typically a
    // fresh literal ([]/null/{...}) each render and only matters as a
    // fallback the moment the key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, value]);

  // ── CROSS-TAB SYNC ───────────────────────────────────────────────────
  //
  // Two tabs open on this app each held their OWN in-memory copy of the
  // same key and neither ever heard about the other's writes, so the last
  // one to re-render won — and for `active-workout` that is data loss, not
  // a stale read. Finish a session in tab A and it clears the key; tab B
  // is still sitting on the pre-finish snapshot, its save effect fires on
  // the next render, and the workout you just logged is written back as
  // active. The same race in the other direction overwrites sets logged
  // in the other tab. An installed PWA plus the site open in a browser tab
  // is enough to hit it; so is a tab left open from yesterday.
  //
  // The `storage` event only ever fires in OTHER tabs of the same origin,
  // never in the one that did the write, so this can't echo our own saves
  // back at us or loop.
  useEffect(() => {
    const prefixed = storageKeyFor(storageKey);
    const onStorage = (event) => {
      // `event.key` is null for a whole-store clear() — not something this
      // app ever does, and re-hydrating every key on one would be a guess.
      if (event.key !== prefixed) return;
      setValue(loadJSON(storageKey, initialValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // initialValue omitted for the same reason as above — a fresh literal
    // each render, only read as a fallback when the other tab removed the
    // key entirely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  return [value, setValue];
}
