// "Does this uid still have an account behind it?"
//
// ── Orphaned accounts ────────────────────────────────────────────────────
//
// Deleting a user in the Firebase console removes the Auth record and
// NOTHING else: users/{uid} and everything under it stays exactly where it
// was. The app's own deleteAccount callable cleans up properly, but a
// console deletion (or a half-failed one) leaves a document behind — a
// ghost with coins, a streak, and an email nobody can reach.
//
// This project has a lot of them: at the time of writing, 33 of 49
// documents in `users` have no Auth account. Any sweep that starts from
// `db.collection('users').get()` is therefore working from a list that is
// two thirds dead, and what it does with those rows is a decision, not a
// detail — they inflate a dashboard total, and they wedge dead entries
// into a friends array that real code then subscribes to.
//
// Shared by adminAnalytics.js (which reports the count as `orphanedDocs`,
// because a growing number there is a real data-hygiene signal) and by
// officialAccount.js's backfill (which skips them).
const { getAuth } = require('firebase-admin/auth');

// getUsers() takes at most 100 identifiers per call. Auth's hard limit,
// not a tuning knob.
const AUTH_LOOKUP_CHUNK = 100;

// Returns a Map of uid -> UserRecord for the uids that still exist. A uid
// that is absent from the map is an orphan. The full record comes back
// rather than a bare Set because the caller often wants what is on it —
// emailVerified, disabled, the creation and last-sign-in timestamps — and
// that costs nothing once the lookup has happened.
async function liveUidsOf(uids) {
  const auth = getAuth();
  const live = new Map();
  for (let i = 0; i < uids.length; i += AUTH_LOOKUP_CHUNK) {
    const chunk = uids.slice(i, i + AUTH_LOOKUP_CHUNK);
    if (chunk.length === 0) break;
    const { users } = await auth.getUsers(chunk.map((uid) => ({ uid })));
    for (const record of users) live.set(record.uid, record);
  }
  return live;
}

module.exports = { liveUidsOf, AUTH_LOOKUP_CHUNK };
