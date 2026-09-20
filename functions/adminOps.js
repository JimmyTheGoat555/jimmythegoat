// The Founder Console's live operations — the admin-only callables behind
// the Operations tab (src/components/admin/OperationsPanel.jsx). Same door
// as adminAnalytics.js (requireAppAdmin, re-checked against Auth on every
// call), same reason none of it is a client-side write: a rules change
// letting one email write every user's coin balance is a rules change
// letting a stolen admin session write every user's coin balance by REST,
// forever. A callable keeps the Admin SDK where it already is and lets
// every grant be bounded and logged here.
//
//   adminSetAnnouncement  — the banner every signed-in user sees on their
//                           next load (config/announcement; the client
//                           listens via hooks/useAnnouncement.js and
//                           remembers a dismissal per announcement id).
//   adminGrantCoins       — coins to one uid, or to every live account.
//   adminGrantXp          — Relative Strength Volume points to one uid or
//                           to everyone, written the way
//                           tools/admin-set-evolution.cjs writes them: an
//                           adjustment workout doc, the aggregate on
//                           meta/records and the friend-visible copy on
//                           public/summary, so every screen agrees. No
//                           coins, no badges, no feed post, no evolution
//                           announcement — an adjustment, not an event.
//
// Every grant is capped, and a global grant is capped in reach too
// (MAX_TARGETS): one call can never become an unbounded write.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { requireAppAdmin } = require('./appAdmin');
const { liveUidsOf } = require('./liveUsers');

const MAX_COINS_PER_GRANT = 100_000;
const MAX_XP_PER_GRANT = 100_000;
const MAX_TARGETS = 2000;
const WRITE_BATCH = 400;
const TITLE_MAX = 80;
const BODY_MAX = 280;
const NOTE_MAX = 120;

const round2 = (n) => Math.round(n * 100) / 100;

function cleanText(value, max, field) {
  if (value == null) return '';
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', `${field} must be text.`);
  const text = value.trim();
  if (text.length > max) throw new HttpsError('invalid-argument', `${field} is over ${max} characters.`);
  return text;
}

function cleanAmount(value, max, field) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1)
    throw new HttpsError('invalid-argument', `${field} must be a whole number of at least 1.`);
  if (n > max)
    throw new HttpsError('invalid-argument', `${field} is capped at ${max.toLocaleString('en-US')} per grant.`);
  return n;
}

// 'all', or one uid. A uid is validated by existence below, not by shape
// — Firebase uids are opaque.
function cleanTarget(value) {
  if (value === 'all') return 'all';
  if (typeof value !== 'string' || !value.trim()) throw new HttpsError('invalid-argument', 'Pick a user id or "all".');
  return value.trim();
}

// Every account with an Auth record still behind it, capped. Orphaned
// docs (deleted in the console, data left behind — see liveUsers.js) are
// skipped rather than paid.
async function liveTargets(db) {
  const snap = await db.collection('users').select().limit(MAX_TARGETS).get();
  const live = await liveUidsOf(snap.docs.map((d) => d.id));
  return snap.docs.map((d) => d.id).filter((id) => live.has(id));
}

async function requireUser(db, uid) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', `No account with id ${uid}.`);
  return { ref, data: snap.data() };
}

exports.adminSetAnnouncement = onCall(async (request) => {
  await requireAppAdmin(request);
  const db = getFirestore();
  const title = cleanText(request.data?.title, TITLE_MAX, 'Title');
  const body = cleanText(request.data?.body, BODY_MAX, 'Message');
  const active = request.data?.active === true;
  if (active && !title && !body)
    throw new HttpsError('invalid-argument', 'An announcement needs a title or a message.');

  const ref = db.collection('config').doc('announcement');
  const previous = (await ref.get()).data() ?? {};
  // A new id whenever the text changes while live, so a dismissal of the
  // OLD banner does not swallow the new one; switching a banner off keeps
  // its id so switching the same one back on stays dismissed for those
  // who already closed it.
  const changed = previous.title !== title || previous.body !== body;
  const id = active && (changed || !previous.id) ? String(Date.now()) : (previous.id ?? null);
  const doc = { id, title, body, active, updatedAt: new Date().toISOString(), updatedBy: request.auth.uid };
  await ref.set(doc);
  return doc;
});

exports.adminGrantCoins = onCall(async (request) => {
  await requireAppAdmin(request);
  const db = getFirestore();
  const target = cleanTarget(request.data?.target);
  const coins = cleanAmount(request.data?.coins, MAX_COINS_PER_GRANT, 'Coins');
  const note = cleanText(request.data?.note, NOTE_MAX, 'Note');
  const at = new Date().toISOString();
  const grant = { coins, note, at, by: request.auth.uid, tool: 'adminGrantCoins' };

  if (target !== 'all') {
    const { ref, data } = await requireUser(db, target);
    await ref.update({ coins: FieldValue.increment(coins), lastAdminGrant: grant });
    return { accounts: 1, coins, displayName: data.displayName ?? null };
  }

  const uids = await liveTargets(db);
  for (let i = 0; i < uids.length; i += WRITE_BATCH) {
    const batch = db.batch();
    for (const uid of uids.slice(i, i + WRITE_BATCH)) {
      batch.update(db.collection('users').doc(uid), { coins: FieldValue.increment(coins), lastAdminGrant: grant });
    }
    await batch.commit();
  }
  return { accounts: uids.length, coins, capped: uids.length >= MAX_TARGETS };
});

// One account's XP adjustment: the three writes tools/admin-set-evolution
// makes, as one batch. Returns what was written so the console can say.
async function grantXpTo(db, uid, points, grant) {
  const userRef = db.collection('users').doc(uid);
  const recordsRef = userRef.collection('meta').doc('records');
  const summaryRef = userRef.collection('public').doc('summary');
  const [records, summary] = await Promise.all([recordsRef.get(), summaryRef.get()]);
  const batch = db.batch();
  batch.set(userRef.collection('workouts').doc(), {
    exercises: [],
    startedAt: grant.at,
    finishedAt: grant.at,
    assignedWorkoutId: null,
    templateId: null,
    verified: true,
    coinsEarned: 0,
    score: points,
    totalVolumeKg: 0,
    recoveryWorkout: false,
    adminAdjustment: { tool: 'adminGrantXp', points, note: grant.note, at: grant.at, by: grant.by },
  });
  if (records.exists) {
    batch.update(recordsRef, { lifetimeVolume: round2((Number(records.get('lifetimeVolume')) || 0) + points) });
  }
  if (summary.exists) {
    batch.update(summaryRef, { lifetimeVolume: Math.round((Number(summary.get('lifetimeVolume')) || 0) + points) });
  }
  await batch.commit();
  return { records: records.exists, summary: summary.exists };
}

exports.adminGrantXp = onCall(async (request) => {
  await requireAppAdmin(request);
  const db = getFirestore();
  const target = cleanTarget(request.data?.target);
  const points = cleanAmount(request.data?.points, MAX_XP_PER_GRANT, 'XP');
  const note = cleanText(request.data?.note, NOTE_MAX, 'Note');
  const grant = { note, at: new Date().toISOString(), by: request.auth.uid };

  if (target !== 'all') {
    const { data } = await requireUser(db, target);
    const written = await grantXpTo(db, target, points, grant);
    return { accounts: 1, points, displayName: data.displayName ?? null, ...written };
  }

  const uids = await liveTargets(db);
  let done = 0;
  for (const uid of uids) {
    await grantXpTo(db, uid, points, grant);
    done += 1;
  }
  return { accounts: done, points, capped: uids.length >= MAX_TARGETS };
});
