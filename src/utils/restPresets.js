// The rest-period presets, the fallback, and the one formatter that turns
// seconds into something a human reads.
//
// Its own module rather than living in hooks/useRestTimer.js because
// SettingsPanel needs the list and the formatter but not the timer: that
// hook drags in restAlarm (an AudioContext) and restNotification (the
// Notification API), neither of which has any business loading because
// someone opened Settings.

export const DEFAULT_REST_SECONDS = 90;

// The ladder people actually rest on. 30s at the bottom for circuits and
// arm supersets, 5:00 at the top for heavy singles — past that a timer
// stops being a rest period and starts being a nap, and anyone training
// that way is watching the clock themselves.
//
// Kept in sync with firestore.rules, which independently bounds the field
// at 15..600 rather than checking membership of THIS list: a range means
// adding a preset here doesn't need a rules deploy, and an out-of-range
// value could only come from a hand-crafted write anyway, where the worst
// outcome is that one account's own timer is odd.
export const REST_PRESETS = [30, 60, 90, 120, 150, 180, 240, 300];

export const MIN_REST_SECONDS = 15;
export const MAX_REST_SECONDS = 600;

// m:ss — "0:30", "1:30", "5:00". One shape for every preset rather than
// "90 sec" below a minute and "2:30" above it, which reads like two
// different settings sitting in the same dropdown.
export function formatRestLabel(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// The single place that decides what a stored `defaultRestTimer` means.
// Absent, null, a string, a number someone typed into the console — all
// collapse to something the timer can actually count down from, because
// the alternative is a NaN countdown that never ends and no obvious cause.
export function normalizeRestSeconds(value, fallback = DEFAULT_REST_SECONDS) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  if (n < MIN_REST_SECONDS || n > MAX_REST_SECONDS) return fallback;
  return n;
}
