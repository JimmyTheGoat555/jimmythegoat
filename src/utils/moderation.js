// Blocking and reporting — the data half of App Store Review Guideline
// 1.2, which this app needs because two things it shows you were typed by
// another user: their display name (everywhere — feed, board, friends
// list, inbox) and the 140-character note attached to a recommended
// workout (functions/recommendWorkout.js).
//
// Deliberately pure and free of Firebase so the filtering rules can be
// checked in Node (tools/moderation.test.mjs) rather than only by clicking
// around the app. hooks/useModeration.js owns the writes.
//
// The model, and why it is this one:
//
//   * A block is a PERSONAL filter list — `blockedUsers` on your own
//     users/{uid} doc, owner-writable (firestore.rules). It is not a
//     mutual state and it does not touch `friends`, which needs both
//     sides' consent and is server-managed. Blocking someone you are
//     friends with hides them completely from your side and leaves the
//     friendship intact underneath, so unblocking restores it rather than
//     requiring a fresh request.
//   * A report is a one-doc-per-pair record in `reports`, keyed
//     `{reporterUid}__{reportedUid}`. The deterministic id is the whole
//     rate limit: a client can write at most one report per account it can
//     see, so there is no way to flood the collection, and re-reporting
//     updates the same doc instead of adding a second. Same keying trick
//     as `cheers/{ownerUid}__{itemId}` already uses.
//
// Nothing here needs a migration: an account that predates the feature has
// no `blockedUsers` field at all, and absent reads as "blocks nobody".

// Cap on one person's block list, enforced here and again in
// firestore.rules. Not a product limit anyone will reach — it exists so a
// tampered client cannot park a megabyte of junk on a doc the account's
// trainer also reads.
export const MAX_BLOCKED = 500;

// Why someone is being reported. Ids are what lands in Firestore; labels
// are what the sheet shows. Kept short and concrete — a list of abstract
// categories makes people pick "Other" and write nothing.
export const REPORT_REASONS = [
  { id: 'offensive_name', label: 'Offensive or explicit username' },
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'spam', label: 'Spam or a scam' },
  { id: 'impersonation', label: 'Pretending to be someone else' },
  { id: 'other', label: 'Something else' },
];

const REASON_IDS = new Set(REPORT_REASONS.map((reason) => reason.id));

export function isReportReason(id) {
  return REASON_IDS.has(id);
}

// The one place the report document id is built, so the client and any
// future server-side tooling cannot drift on the separator. Mirrors
// utils/cheers' `{ownerUid}__{itemId}`.
export function reportDocId(reporterUid, reportedUid) {
  return `${reporterUid}__${reportedUid}`;
}

// `users/{uid}.blockedUsers`, defended against every shape Firestore can
// actually hand back: the field missing entirely (every account created
// before this feature), null, or a list with a stray non-string in it.
export function readBlockedUids(account) {
  const raw = account?.blockedUsers;
  if (!Array.isArray(raw)) return [];
  return raw.filter((uid) => typeof uid === 'string' && uid.length > 0);
}

export function isBlocked(blockedUids, uid) {
  if (!uid) return false;
  return (blockedUids ?? []).includes(uid);
}

// Drop everything authored by a blocked account.
//
// `getUid` reads the AUTHOR off each item, and every caller passes a
// different one because no two of these collections agree on the field
// name: a feed post has `userId`, a friend has `uid`, a notification hides
// it at `data.fromUid`, an inbox item calls it `senderUid`. Passing the
// accessor in beats teaching this function six shapes.
//
// Returns the original array untouched when nothing is blocked — the
// common case by a wide margin, and identity matters here: these results
// feed `useMemo` deps and Firestore query keys upstream.
export function withoutBlocked(items, blockedUids, getUid) {
  if (!Array.isArray(items) || items.length === 0) return items ?? [];
  if (!blockedUids || blockedUids.length === 0) return items;
  const blocked = new Set(blockedUids);
  const kept = items.filter((item) => !blocked.has(getUid(item)));
  return kept.length === items.length ? items : kept;
}

// The same thing for a bare array of uids — `account.friends`, which is
// what the feed query, the friends directory and the leaderboard are all
// built from.
export function withoutBlockedUids(uids, blockedUids) {
  return withoutBlocked(uids, blockedUids, (uid) => uid);
}
