// Thin localStorage wrapper. Namespaced so this app never collides with
// other data that might live in the same browser storage.
const PREFIX = 'jimmy-goat';

const key = (name) => `${PREFIX}:${name}`;

// The same key, exported. A `storage` event hands you the RAW, fully
// namespaced key string, so a listener deciding "is this event about my
// value?" needs to build the prefixed form itself rather than
// re-implementing the template and drifting from it (see
// hooks/useLocalStorage.js).
export function storageKeyFor(name) {
  return key(name);
}

export function loadJSON(name, fallback) {
  try {
    const raw = window.localStorage.getItem(key(name));
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(name, value) {
  try {
    window.localStorage.setItem(key(name), JSON.stringify(value));
  } catch {
    // Storage full or unavailable (private mode) — fail silently, app still
    // works in-memory for the current session.
  }
}
