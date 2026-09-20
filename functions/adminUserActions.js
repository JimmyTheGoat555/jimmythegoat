// The Founder Console's Targeted User Actions — "God Mode" for one account
// at a time (src/components/admin/UserActionsPanel.jsx). Same door as
// every other admin callable (requireAppAdmin, re-checked against Auth on
// every call, fails closed), same reason none of it is a client write: a
// rule that let the admin's session edit any user's coins, tier or
// character would let a stolen admin session do the same by REST forever.
// The Admin SDK stays here, every write is bounded, and every write is
// stamped with who made it.
//
//   adminFindUsers        — pick the account: by uid, by username
//                           (usernames/{key}, the same key claimUsername
//                           reserves) or by a substring of the display
//                           name, the way searchUsers matches.
//   adminUserProfile      — the dossier the panel shows before any action:
//                           balance, ladder, tier, character, last
//                           message, Auth state.
//   adminMessageUser      — a direct message. Stored under
//                           users/{uid}/messages, which the app listens to
//                           (hooks/useFounderMessage.js) and shows as a
//                           sheet the next time THAT person opens the app;
//                           mirrored into their notifications so it also
//                           rides the push pipeline (index.js).
//   adminAdjustCoins      — deposit or deduct. A deduction stops at zero.
//   adminShiftEvolution   — one tier up or down, written the way
//                           tools/admin-set-evolution.cjs writes it: an
//                           adjustment workout doc carrying the points
//                           difference, plus meta/records and
//                           public/summary, so every screen agrees.
//   adminSetMascot        — Jimmy ↔ Gena. The ladder follows the character
//                           (functions/evolution.js's progressionScaleFor),
//                           so the swap re-publishes `progressionScale`
//                           beside `mascot` on the summary and on every
//                           feed post, and grants at once any badge the
//                           new tree already awards from the aggregates —
//                           the same call logWorkout makes, just not
//                           waiting for the next session.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { requireAppAdmin } = require('./appAdmin');
const { MASCOT_IDS, resolveMascotId } = require('./mascots');
const { EVOLUTION_TIERS, tierForVolume, progressionScaleFor } = require('./evolution');
const { lifetimeVolumeOf } = require('./records');
const { evaluateBadges } = require('./badges');
const { usernameKey } = require('./usernames')._internals;

const MIN_TERM = 2;
const MAX_TERM = 60;
const MAX_RESULTS = 8;
const MAX_COIN_DELTA = 100_000;
const TITLE_MAX = 80;
const BODY_MAX = 500;
const NOTE_MAX = 120;
const WRITE_BATCH = 400;
const MAX_STAGE = EVOLUTION_TIERS[EVOLUTION_TIERS.length - 1].stage;

const round2 = (n) => Math.round(n * 100) / 100;

function cleanText(value, max, field) {
  if (value == null) return '';
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', `${field} must be text.`);
  const text = value.trim();
  if (text.length > max) throw new HttpsError('invalid-argument', `${field} is over ${max} characters.`);
  return text;
}

function cleanUid(value) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpsError('invalid-argument', 'Pick a user first.');
  return value.trim();
}

async function requireUser(db, uid) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', `No account with id ${uid}.`);
  return { ref, data: snap.data() };
}

// `.doc('')` and a path with a slash throw synchronously; a search term is
// whatever the admin typed, so both are ordinary input here.
function readDoc(collection, id) {
  try {
    return collection.doc(id).get();
  } catch {
    return Promise.resolve(null);
  }
}

// Lowercased with separators dropped — the same folding usernames.js
// applies to the reservation key, so a search matches the way a claim does.
const fold = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[\s_.-]+/g, '');

// The row the picker lists: enough to tell two Danas apart, nothing more.
function rowOf(uid, data) {
  return {
    uid,
    displayName: data.displayName ?? '',
    email: data.email ?? null,
    mascot: resolveMascotId(data),
    gender: data.gender ?? null,
    role: data.role ?? 'lifter',
    coins: Number(data.coins) || 0,
  };
}

const minStageOf = (user) => (user.role === 'trainer' ? 2 : 1);

// The latest real session — the adjustment docs written here and by
// adminGrantXp carry no exercises and must not count as "last trained".
function latestFinishedAt(workouts) {
  let latest = null;
  for (const w of workouts) {
    if (!w.finishedAt || w.recoveryWorkout || w.adminAdjustment) continue;
    if (latest === null || w.finishedAt > latest) latest = w.finishedAt;
  }
  return latest;
}

exports.adminFindUsers = onCall(async (request) => {
  await requireAppAdmin(request);
  const db = getFirestore();
  const raw = String(request.data?.term ?? '')
    .trim()
    .slice(0, MAX_TERM);
  if (raw.length < MIN_TERM) return { results: [] };
  const term = raw.toLowerCase();
  const folded = fold(raw);
  console.log('[adminFindUsers] term', raw);

  const results = [];
  const seen = new Set();
  const push = (snap) => {
    if (!snap?.exists || seen.has(snap.id)) return;
    seen.add(snap.id);
    results.push(rowOf(snap.id, snap.data()));
  };

  // An exact uid and an exact username come first, then the substring
  // matches the way the social search ranks them (prefix, then alphabet).
  const users = db.collection('users');
  const [byUid, claim] = await Promise.all([
    readDoc(users, raw),
    readDoc(db.collection('usernames'), usernameKey(raw)),
  ]);
  push(byUid);
  if (claim?.exists && typeof claim.get('uid') === 'string') push(await readDoc(users, claim.get('uid')));

  // Case-insensitive substring over the display name (folded too, so
  // separators do not matter) and the email — a whole-collection scan,
  // for the reasons functions/userSearch.js gives.
  const scan = await users.select('displayName', 'email', 'mascot', 'gender', 'role', 'coins').get();
  const matches = scan.docs
    .filter((doc) => {
      if (seen.has(doc.id)) return false;
      const d = doc.data();
      const name = String(d.displayName ?? '').toLowerCase();
      return (
        name.includes(term) ||
        (folded.length > 0 && fold(name).includes(folded)) ||
        String(d.email ?? '')
          .toLowerCase()
          .includes(term)
      );
    })
    .sort((a, b) => {
      const an = String(a.data().displayName).toLowerCase();
      const bn = String(b.data().displayName).toLowerCase();
      const ap = an.startsWith(term);
      const bp = bn.startsWith(term);
      if (ap !== bp) return ap ? -1 : 1;
      return an.localeCompare(bn);
    })
    .slice(0, Math.max(0, MAX_RESULTS - results.length));
  for (const doc of matches) push(doc);

  console.log(
    '[adminFindUsers] results',
    results.map((r) => `${r.displayName} <${r.email ?? '-'}> ${r.uid}`),
  );
  return { results };
});

exports.adminUserProfile = onCall(async (request) => {
  await requireAppAdmin(request);
  const db = getFirestore();
  const uid = cleanUid(request.data?.uid);
  const { ref, data } = await requireUser(db, uid);

  const [records, summary, workoutsSnap, messages, authRecord] = await Promise.all([
    ref.collection('meta').doc('records').get(),
    ref.collection('public').doc('summary').get(),
    ref.collection('workouts').get(),
    ref.collection('messages').orderBy('createdAt', 'desc').limit(1).get(),
    getAuth()
      .getUser(uid)
      .catch(() => null),
  ]);

  // The number THEIR screen shows: the client sums its own workout docs
  // (src/utils/workoutStats.js). records and summary are the two mirrors,
  // reported beside it so a drift is visible here before it is a ticket.
  const workouts = workoutsSnap.docs.map((d) => d.data());
  const volume = round2(lifetimeVolumeOf(workouts));
  const scale = progressionScaleFor(data);
  const minStage = minStageOf(data);
  const tier = tierForVolume(volume, { minStage, scale });
  const badges = Array.isArray(data.badges) ? data.badges : [];
  const last = messages.docs[0];

  return {
    uid,
    displayName: data.displayName ?? null,
    email: data.email ?? authRecord?.email ?? null,
    role: data.role ?? 'lifter',
    gender: data.gender ?? null,
    mascot: resolveMascotId(data),
    // Explicit choice vs. the gender default — the panel says which.
    mascotExplicit: MASCOT_IDS.includes(data.mascot) ? data.mascot : null,
    coins: Number(data.coins) || 0,
    badgeCount: badges.length,
    createdAt: data.createdAt ?? null,
    lastWorkoutAt: data.lastWorkoutAt ?? latestFinishedAt(workouts),
    workoutCount: records.exists ? Number(records.get('workoutCount')) || 0 : null,
    currentStreak: summary.exists ? Number(summary.get('currentStreak')) || 0 : 0,
    volume,
    recordsVolume: records.exists ? Number(records.get('lifetimeVolume')) || 0 : null,
    summaryVolume: summary.exists ? Number(summary.get('lifetimeVolume')) || 0 : null,
    scale,
    minStage,
    stage: tier.stage,
    tier: tier.label,
    auth: authRecord
      ? {
          emailVerified: authRecord.emailVerified === true,
          disabled: authRecord.disabled === true,
          lastSignInAt: authRecord.metadata?.lastSignInTime ?? null,
        }
      : null,
    lastMessage: last
      ? {
          id: last.id,
          title: last.get('title') ?? '',
          createdAt: last.get('createdAt') ?? null,
          readAt: last.get('readAt') ?? null,
        }
      : null,
    lastAdminGrant: data.lastAdminGrant ?? null,
  };
});

exports.adminMessageUser = onCall(async (request) => {
  await requireAppAdmin(request);
  const db = getFirestore();
  const uid = cleanUid(request.data?.uid);
  const title = cleanText(request.data?.title, TITLE_MAX, 'Title');
  const body = cleanText(request.data?.body, BODY_MAX, 'Message');
  if (!body) throw new HttpsError('invalid-argument', 'Write the message first.');
  const { ref, data } = await requireUser(db, uid);

  const at = new Date().toISOString();
  const messageRef = ref.collection('messages').doc();
  const batch = db.batch();
  // The sheet the app opens on their next load. `readAt: null` is the
  // field the client queries on, so it is written as null, not omitted.
  batch.set(messageRef, { id: messageRef.id, title, body, createdAt: at, readAt: null, by: request.auth.uid });
  // And the inbox copy, which index.js's trigger turns into a real push
  // and which stays in their notification list after the sheet is closed.
  batch.set(ref.collection('notifications').doc(), {
    type: 'founder_message',
    title: title || 'A message from Jimmy 🐐',
    body,
    messageId: messageRef.id,
    read: false,
    createdAt: at,
  });
  await batch.commit();
  return { id: messageRef.id, displayName: data.displayName ?? null, createdAt: at };
});

exports.adminAdjustCoins = onCall(async (request) => {
  await requireAppAdmin(request);
  const db = getFirestore();
  const uid = cleanUid(request.data?.uid);
  const delta = Math.trunc(Number(request.data?.delta));
  if (!Number.isFinite(delta) || delta === 0)
    throw new HttpsError('invalid-argument', 'Enter a whole number of coins other than zero.');
  if (Math.abs(delta) > MAX_COIN_DELTA)
    throw new HttpsError(
      'invalid-argument',
      `Capped at ${MAX_COIN_DELTA.toLocaleString('en-US')} coins per adjustment.`,
    );
  const note = cleanText(request.data?.note, NOTE_MAX, 'Note');
  const at = new Date().toISOString();

  // A transaction rather than FieldValue.increment: a deduction must stop
  // at zero, which needs the balance read in the same commit.
  const userRef = db.collection('users').doc(uid);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpsError('not-found', `No account with id ${uid}.`);
    const before = Math.max(0, Number(snap.get('coins')) || 0);
    const after = Math.max(0, before + delta);
    const applied = after - before;
    tx.update(userRef, {
      coins: after,
      lastAdminGrant: { coins: applied, note, at, by: request.auth.uid, tool: 'adminAdjustCoins' },
    });
    return { before, after, applied, displayName: snap.get('displayName') ?? null };
  });
  return result;
});

exports.adminShiftEvolution = onCall(async (request) => {
  await requireAppAdmin(request);
  const db = getFirestore();
  const uid = cleanUid(request.data?.uid);
  const direction = Number(request.data?.direction);
  if (direction !== 1 && direction !== -1) throw new HttpsError('invalid-argument', 'Direction must be +1 or -1.');
  const { ref, data } = await requireUser(db, uid);

  const [workoutsSnap, records, summary] = await Promise.all([
    ref.collection('workouts').get(),
    ref.collection('meta').doc('records').get(),
    ref.collection('public').doc('summary').get(),
  ]);
  const workouts = workoutsSnap.docs.map((d) => d.data());
  const volume = round2(lifetimeVolumeOf(workouts));
  const scale = progressionScaleFor(data);
  const minStage = minStageOf(data);
  const current = tierForVolume(volume, { minStage, scale });
  const targetStage = current.stage + direction;
  if (targetStage > MAX_STAGE)
    throw new HttpsError('failed-precondition', `${data.displayName ?? 'This account'} is already at the top tier.`);
  if (targetStage < minStage) {
    throw new HttpsError(
      'failed-precondition',
      minStage > 1
        ? 'A coach is drawn from Buff Goat up — there is no lower tier for this account.'
        : `${data.displayName ?? 'This account'} is already at the first tier.`,
    );
  }
  const target = EVOLUTION_TIERS.find((t) => t.stage === targetStage);

  // Land one full point above the target's threshold on THIS account's
  // ladder, in both directions: an upgrade that sat exactly on the line
  // could round under it in the client's float sum, and a downgrade that
  // did would leave them one set from bouncing straight back.
  const nextVolume = round2(target.threshold * scale + 1);
  const delta = round2(nextVolume - volume);
  const at = new Date().toISOString();
  // Dated a second after their latest real session so it neither resets
  // the neglect clock nor tops their history — see the admin tool.
  const latest = latestFinishedAt(workouts);
  const finishedAt = latest ? new Date(Date.parse(latest) + 1000).toISOString() : at;

  const adjustmentRef = ref.collection('workouts').doc();
  const batch = db.batch();
  batch.set(adjustmentRef, {
    exercises: [],
    startedAt: finishedAt,
    finishedAt,
    assignedWorkoutId: null,
    templateId: null,
    verified: true,
    coinsEarned: 0,
    score: delta,
    totalVolumeKg: 0,
    recoveryWorkout: false,
    adminAdjustment: { tool: 'adminShiftEvolution', stage: target.stage, points: delta, at, by: request.auth.uid },
  });
  // Set, not incremented: after this every mirror holds the same number
  // the client will sum, whatever drift they carried before.
  if (records.exists) batch.update(records.ref, { lifetimeVolume: nextVolume });
  if (summary.exists) batch.update(summary.ref, { lifetimeVolume: Math.round(nextVolume) });
  await batch.commit();

  return {
    displayName: data.displayName ?? null,
    from: { stage: current.stage, label: current.label },
    to: { stage: target.stage, label: target.label },
    volumeBefore: volume,
    volumeAfter: nextVolume,
    delta,
    adjustmentId: adjustmentRef.id,
  };
});

exports.adminSetMascot = onCall(async (request) => {
  await requireAppAdmin(request);
  const db = getFirestore();
  const uid = cleanUid(request.data?.uid);
  const mascot = request.data?.mascot;
  if (!MASCOT_IDS.includes(mascot))
    throw new HttpsError('invalid-argument', `Mascot must be one of ${MASCOT_IDS.join(', ')}.`);
  const { ref, data } = await requireUser(db, uid);

  const [records, profile, summary, postsSnap] = await Promise.all([
    ref.collection('meta').doc('records').get(),
    ref.collection('meta').doc('profile').get(),
    ref.collection('public').doc('summary').get(),
    db.collection('feedPosts').where('userId', '==', uid).select().get(),
  ]);

  const before = { mascot: resolveMascotId(data), scale: progressionScaleFor(data) };
  // The rule is evaluated on the doc AS IT WILL BE, so this call and the
  // next logWorkout cannot disagree about the ladder.
  const nextData = { ...data, mascot };
  const scale = progressionScaleFor(nextData);
  const minStage = minStageOf(data);
  const volume = Number(records.exists ? records.get('lifetimeVolume') : summary.get('lifetimeVolume')) || 0;
  const stageBefore = tierForVolume(volume, { minStage, scale: before.scale });
  const stageAfter = tierForVolume(volume, { minStage, scale });

  // The new tree, on the aggregates already held. Badges are only ever
  // added (same arrayUnion as logWorkout), so a swap never takes one away
  // and a swap back never double-awards.
  const bwLog = profile.data()?.bodyWeightLog;
  const bodyWeightKg = Array.isArray(bwLog) && bwLog.length ? Number(bwLog[0]?.weight) : 0;
  const held = Array.isArray(data.badges) ? data.badges : [];
  const heldIds = new Set(held.map((b) => (typeof b === 'string' ? b : b?.id)));
  const at = new Date().toISOString();
  const newBadges = [...evaluateBadges(records.exists ? records.data() : {}, { bodyWeightKg, mascot })].filter(
    (id) => !heldIds.has(id),
  );
  const awarded = newBadges.map((id) => ({ id, at }));

  const writes = [
    {
      ref,
      data: { mascot, ...(awarded.length ? { badges: FieldValue.arrayUnion(...awarded) } : {}) },
    },
  ];
  if (summary.exists) {
    writes.push({
      ref: summary.ref,
      data: {
        mascot,
        progressionScale: scale,
        ...(awarded.length ? { badges: FieldValue.arrayUnion(...awarded) } : {}),
      },
    });
  }
  // Every post they have written: the feed and the leaderboard draw the
  // avatar AND the tier from the post, so a character without its ladder
  // would be drawn at the wrong stage on exactly those two screens.
  for (const post of postsSnap.docs) writes.push({ ref: post.ref, data: { mascot, progressionScale: scale } });

  for (let i = 0; i < writes.length; i += WRITE_BATCH) {
    const batch = db.batch();
    for (const { ref: target, data: patch } of writes.slice(i, i + WRITE_BATCH)) batch.update(target, patch);
    await batch.commit();
  }

  return {
    displayName: data.displayName ?? null,
    mascot,
    before: { ...before, stage: stageBefore.stage, tier: stageBefore.label },
    after: { mascot, scale, stage: stageAfter.stage, tier: stageAfter.label },
    postsUpdated: postsSnap.size,
    summaryUpdated: summary.exists,
    newBadges,
  };
});
