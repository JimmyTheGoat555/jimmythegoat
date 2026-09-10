// Thin localStorage wrapper. Namespaced so this app never collides with
// other data that might live in the same browser storage.
const PREFIX = 'jimmy-goat';

const key = (name) => `${PREFIX}:${name}`;

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
