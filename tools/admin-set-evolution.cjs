#!/usr/bin/env node
// Raises one account to a given evolution tier directly, as the project
// owner, for testing. Local admin tooling — never deployed, never callable
// from the app. Sibling of admin-set-coins.cjs.
//
//   NODE_PATH=functions/node_modules node tools/admin-set-evolution.cjs \
//       --username=vakninos --stage=3 [--dry-run] [--project=jimmy-the-goat]
//
//   --username  the display name / handle (resolved through usernames/{key},
//               falling back to a users.displayName lookup)
//   --email     the account email instead of a username
//   --stage     1–4, matching EVOLUTION_TIERS in functions/evolution.js
//               (1 Goat · 2 Buff Goat · 3 Titan Goat · 4 Legendary G.O.A.T.)
//   --dry-run   print what would be written and exit without writing
//
// Credentials come from Application Default Credentials, the standard
// Google mechanism (GOOGLE_APPLICATION_CREDENTIALS pointing at a service
// account key, or `gcloud auth application-default login`). The script
// never reads, prints or stores a credential itself; if none is
// available it says so and exits without touching anything.
//
// ── WHAT IT WRITES, AND WHY THIS SHAPE ──────────────────────────────────
//
// There is no "level" field to set. A tier is derived from cumulative
// Relative Strength Volume — the client sums `score` across the verified
// docs in users/{uid}/workouts (src/utils/workoutStats.js), the server
// keeps a running total in users/{uid}/meta/records, and friends read the
// copy on users/{uid}/public/summary. So the only way to raise a tier
// that every screen agrees on is to raise the volume everywhere the
// volume lives:
//
//   1. ONE new doc in users/{uid}/workouts carrying `verified: true`, no
//      exercises, and `score` = exactly the points missing to the target
//      threshold (+1 so float sums land cleanly above it). Verified is what
//      lets the client count it; an empty exercise list means no fake
//      lifts, no fake PRs, nothing on the progress charts. It is dated to
//      the second after the account's latest real workout so it neither
//      resets their idle clock nor jumps the top of their history. Marked
//      `adminAdjustment` so it can be found and deleted later.
//   2. meta/records.lifetimeVolume raised by the same amount, so the next
//      real workout's before/after comparison in logWorkout() is
//      consistent and does not announce a tier the account already shows.
//   3. public/summary.lifetimeVolume raised the same way, so a friend's
//      view of the profile matches.
//
// Nothing else moves: no coins, no badges, no workout count, no feed post
// (so the weekly leaderboard is untouched; the lifetime leaderboard reads
// feed posts, which pick the new tier up from the next real session), and
// no evolution notification to friends — this is a test adjustment, not
// an event. The Admin SDK bypasses firestore.rules by design; this is the
// one path that may write a `score` the server did not earn, and it
// exists only for the owner's own test accounts.
//
// To reverse: delete the adjustment doc (its id is printed) and subtract
// the printed delta from meta/records.lifetimeVolume and
// public/summary.lifetimeVolume.

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { EVOLUTION_TIERS, tierForVolume, progressionScaleFor } = require('../functions/evolution');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);
const username = args.username;
const email = args.email;
const stage = Number(args.stage);
const dryRun = args['dry-run'] === 'true';
const projectId = args.project || process.env.GCLOUD_PROJECT || 'jimmy-the-goat';

const target = EVOLUTION_TIERS.find((t) => t.stage === stage);
if ((!username && !email) || !target) {
  console.error(
    'usage: node tools/admin-set-evolution.cjs (--username=<name> | --email=<account email>) --stage=<1-4> [--dry-run] [--project=jimmy-the-goat]',
  );
  process.exit(2);
}

// Twin of functions/usernames.js's usernameKey — case- and
// separator-insensitive, so "Vak Ninos" and "vakninos" resolve alike.
function usernameKey(display) {
  return display
    .toLowerCase()
    .replace(/[\s_.]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Twin of src/utils/workoutStats.js's workoutScore: only a verified doc
// or one with a numeric score counts, exactly as the client sums it.
const LEGACY_BODYWEIGHT_KG = 75;
function workoutScore(w) {
  if (w.verified !== true && typeof w.score !== 'number') return 0;
  if (typeof w.score === 'number' && Number.isFinite(w.score)) return w.score;
  let relative = 0;
  let legacy = 0;
  let sawRelative = false;
  for (const exercise of w.exercises ?? []) {
    for (const s of exercise.sets ?? []) {
      if (!s.completed) continue;
      const reps = Number(s.reps) || 0;
      const weight = Number(s.weight) || 0;
      if (Number.isFinite(Number(s.relativeVolume))) {
        sawRelative = true;
        relative += Number(s.relativeVolume);
      }
      legacy += (weight / LEGACY_BODYWEIGHT_KG) * reps;
    }
  }
  return sawRelative ? relative : legacy;
}

const round2 = (n) => Math.round(n * 100) / 100;
const NEGLECT_DAYS = 5;

async function resolveUid(db, auth) {
  if (email) {
    const user = await auth.getUserByEmail(email);
    return { uid: user.uid, via: `auth ${email}` };
  }
  const key = usernameKey(username);
  const claim = await db.collection('usernames').doc(key).get();
  if (claim.exists && typeof claim.get('uid') === 'string') {
    return { uid: claim.get('uid'), via: `usernames/${key}` };
  }
  const byName = await db.collection('users').where('displayName', '==', username).limit(2).get();
  if (byName.size === 1) return { uid: byName.docs[0].id, via: `users.displayName == "${username}"` };
  if (byName.size > 1) throw new Error(`"${username}" is ambiguous — more than one account has that display name`);
  throw new Error(`no account found for "${username}" (usernames/${key} missing, no users.displayName match)`);
}

async function main() {
  initializeApp({ credential: applicationDefault(), projectId });
  const auth = getAuth();
  const db = getFirestore();

  const { uid, via } = await resolveUid(db, auth);
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new Error(`users/${uid} does not exist — the account has not completed onboarding`);
  }
  const user = userSnap.data();
  const who = `${user.displayName ?? '(no name)'} (uid ${uid}, via ${via})`;

  const workoutsRef = userRef.collection('workouts');
  const recordsRef = userRef.collection('meta').doc('records');
  const summaryRef = userRef.collection('public').doc('summary');
  const [workouts, records, summary] = await Promise.all([workoutsRef.get(), recordsRef.get(), summaryRef.get()]);

  let clientVolume = 0;
  let latestFinishedAt = null;
  for (const doc of workouts.docs) {
    const w = doc.data();
    if (!w.finishedAt || w.recoveryWorkout) continue;
    clientVolume += workoutScore(w);
    if (latestFinishedAt === null || w.finishedAt > latestFinishedAt) latestFinishedAt = w.finishedAt;
  }
  clientVolume = round2(clientVolume);

  const minStage = user.role === 'trainer' ? 2 : 1;
  // A female account's thresholds sit at 0.65 of the table — the target
  // is the scaled one, the same the server would evolve them at.
  const scale = progressionScaleFor(user);
  const goal = target.threshold * scale;
  const current = tierForVolume(clientVolume, { minStage, scale });
  console.log(`${who}`);
  console.log(
    `  current tier: ${current.label} (stage ${current.stage}) at ${clientVolume} points over ${workouts.size} workout docs`,
  );
  console.log(
    `  meta/records.lifetimeVolume:   ${records.exists ? records.get('lifetimeVolume') : '(no records doc yet)'}`,
  );
  console.log(
    `  public/summary.lifetimeVolume: ${summary.exists ? summary.get('lifetimeVolume') : '(no summary doc yet)'}`,
  );

  if (current.stage >= target.stage) {
    console.log(`  already at or above ${target.label} — nothing to do`);
    return;
  }

  // Land at least one full point above the threshold so the client's
  // float sum can never round to a hair below it.
  const delta = Math.max(1, Math.ceil(goal - clientVolume + 1));
  const nextClientVolume = round2(clientVolume + delta);
  const nextRecords = records.exists
    ? Math.max(round2((Number(records.get('lifetimeVolume')) || 0) + delta), nextClientVolume)
    : null;
  const nextSummary = summary.exists
    ? Math.max(Math.round((Number(summary.get('lifetimeVolume')) || 0) + delta), Math.round(nextClientVolume))
    : null;

  // Dated to the second after their latest real workout — see the header.
  const nowIso = new Date().toISOString();
  const finishedAtIso = latestFinishedAt ? new Date(Date.parse(latestFinishedAt) + 1000).toISOString() : nowIso;
  const idleDays = latestFinishedAt ? (Date.now() - Date.parse(latestFinishedAt)) / 86_400_000 : null;

  console.log(
    `  target: ${target.label} (stage ${target.stage}, threshold ${goal}${scale !== 1 ? ` = ${target.threshold} × ${scale}` : ''}) → adding ${delta} points`,
  );
  console.log(`    workouts/<new>: verified, no exercises, score ${delta}, finishedAt ${finishedAtIso}`);
  console.log(
    `    meta/records.lifetimeVolume:   ${records.exists ? `${records.get('lifetimeVolume')} → ${nextRecords}` : 'skipped (built from history on the next logged workout)'}`,
  );
  console.log(
    `    public/summary.lifetimeVolume: ${summary.exists ? `${summary.get('lifetimeVolume')} → ${nextSummary}` : 'skipped (written on the next logged workout)'}`,
  );
  if (idleDays !== null && idleDays >= NEGLECT_DAYS) {
    console.log(
      `  note: last workout was ${Math.floor(idleDays)} days ago — the app draws a neglected account one tier lower (${EVOLUTION_TIERS.find((t) => t.stage === target.stage - 1)?.label}) until they log a workout`,
    );
  }
  if (dryRun) {
    console.log('  dry run — nothing written');
    return;
  }

  const adjustmentRef = workoutsRef.doc();
  const batch = db.batch();
  batch.set(adjustmentRef, {
    exercises: [],
    startedAt: finishedAtIso,
    finishedAt: finishedAtIso,
    assignedWorkoutId: null,
    templateId: null,
    verified: true,
    coinsEarned: 0,
    score: delta,
    totalVolumeKg: 0,
    recoveryWorkout: false,
    adminAdjustment: { tool: 'tools/admin-set-evolution.cjs', stage: target.stage, points: delta, at: nowIso },
  });
  if (records.exists) batch.update(recordsRef, { lifetimeVolume: nextRecords });
  if (summary.exists) batch.update(summaryRef, { lifetimeVolume: nextSummary });
  await batch.commit();

  const after = round2(
    (await workoutsRef.get()).docs.reduce((sum, d) => {
      const w = d.data();
      return !w.finishedAt || w.recoveryWorkout ? sum : sum + workoutScore(w);
    }, 0),
  );
  const tier = tierForVolume(after, { minStage, scale });
  console.log(`  done: ${clientVolume} → ${after} points, now ${tier.label} (stage ${tier.stage})`);
  console.log(
    `  adjustment doc: users/${uid}/workouts/${adjustmentRef.id} (delete it and subtract ${delta} from records/summary to undo)`,
  );
}

main().catch((err) => {
  // A missing credential surfaces here as a "Could not load the default
  // credentials" error from google-auth-library.
  console.error(err.message);
  process.exit(1);
});
