// The one-time migration that moves every female account onto Gena.
//
// Its own file rather than a tail on mascots.js, for two reasons. The
// resolver there is a pure helper with no Firebase imports at all — it is
// required by economy.js, onboarding.js and publicProfile.js on every cold
// start, and it should not drag `onCall` and the Admin SDK in behind it.
// And mascots.js reassigns `module.exports` to an object literal, so an
// `exports.foo = ` added below that line attaches to an object nothing
// reads: the callable would deploy as missing, which is a quiet enough
// failure to be worth designing out.

// ── What this is for ──────────────────────
//
// The gender default already works without this: resolveMascotId reads
// `gender` whenever `mascot` is unset, so a female account renders as Gena
// on her own screens the moment the frontend deploys. What it does NOT fix
// is the two places other people see her, both of which are SNAPSHOTS
// written at workout time and neither of which is re-derived on read:
//
//   feedPosts        — the feed and the leaderboard build their avatars
//                      from these and never touch anyone's user doc.
//   public/summary   — a friend's profile, search rows, suggestion cards.
//
// Without this migration both correct themselves, but only at each user's
// next logged workout. This closes the gap immediately.
//
// ── WHAT IT WILL NOT DO ──────────────────────────────────────────────────
//
// It never overwrites an explicit `mascot: 'jimmy'`. A woman who opened
// Settings and chose Jimmy has answered this exact question already, and a
// migration that silently reverses a user's own choice is a bug with a
// migration's paperwork. Those accounts are counted and reported as
// `skippedChoseJimmy` so the number is visible rather than invisible.
//
// Orphans are skipped, the same way backfillUsernames and the friend
// backfill skip them (see liveUsers.js): two thirds of the `users`
// collection has no Auth account behind it, and writing to those inflates
// the numbers this run reports without changing anything a person sees.
//
// Idempotent: every write is an absolute set to the same value, so a
// second run rewrites the identical bytes and reports the same totals.
// Safe to re-run, and worth re-running after any window where someone
// might have logged a workout mid-migration.
const { onCall } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { requireAppAdmin } = require('./appAdmin');
const { liveUidsOf } = require('./liveUsers');

// Firestore's hard ceiling is 500 writes per batch; the margin is for the
// summary write that rides along with some of the user docs.
const WRITE_BATCH = 400;
// `in` queries take at most 30 values. Auth's 100 is a different limit —
// see liveUsers.js.
const IN_QUERY_CHUNK = 30;

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

exports.backfillFemaleMascots = onCall(async (request) => {
  await requireAppAdmin(request);
  // Pass { dryRun: true } to get the exact same counts with nothing
  // written. Worth doing first: this touches every feed post those
  // accounts have ever made, and the cheapest time to notice a number
  // that looks wrong is before the writes rather than after.
  const dryRun = request.data?.dryRun === true;
  const db = getFirestore();

  // `select()` so a sweep of every user document fetches two fields rather
  // than whole profiles.
  const femaleSnap = await db
    .collection('users')
    .where('gender', '==', 'female')
    .select('mascot')
    .get();

  const live = await liveUidsOf(femaleSnap.docs.map((d) => d.id));

  const targets = [];
  let skippedOrphans = 0;
  let skippedChoseJimmy = 0;
  let alreadyGena = 0;

  for (const doc of femaleSnap.docs) {
    if (!live.has(doc.id)) {
      skippedOrphans += 1;
      continue;
    }
    const current = doc.data()?.mascot;
    if (current === 'jimmy') {
      skippedChoseJimmy += 1;
      continue;
    }
    if (current === 'gena') alreadyGena += 1;
    targets.push(doc.id);
  }

  // Read before writing: the summary is only updated where one already
  // exists. Creating it here would publish a document holding a mascot and
  // nothing else for someone who has never logged a workout — and both
  // readers of that document (userSearch, friendSuggestions) already treat
  // "no summary" correctly, so a half-built one is strictly worse than
  // none.
  const summaryRefs = targets.map((uid) =>
    db.collection('users').doc(uid).collection('public').doc('summary'),
  );
  const summarySnaps = summaryRefs.length ? await db.getAll(...summaryRefs, { fieldMask: [] }) : [];
  const existingSummaries = summarySnaps.filter((s) => s.exists).map((s) => s.ref);

  // Every feed post those accounts have ever written. Queried in `in`
  // chunks rather than one query per user: this is the part of the run
  // that scales with history rather than headcount.
  const postRefs = [];
  for (const group of chunk(targets, IN_QUERY_CHUNK)) {
    const postsSnap = await db.collection('feedPosts').where('userId', 'in', group).select().get();
    for (const post of postsSnap.docs) postRefs.push(post.ref);
  }

  const result = {
    ran: !dryRun,
    dryRun,
    femaleUserDocs: femaleSnap.size,
    // How many accounts this run is responsible for. `alreadyGena` is a
    // subset of it, not a separate group — those still need their posts
    // and summary checked, which is the whole reason a re-run is useful.
    switched: targets.length,
    alreadyGena,
    summariesUpdated: existingSummaries.length,
    summariesMissing: targets.length - existingSummaries.length,
    feedPostsUpdated: postRefs.length,
    skippedOrphans,
    skippedChoseJimmy,
  };

  if (dryRun || targets.length === 0) return result;

  // One flat list, committed in batches. `update` rather than `set` on the
  // posts and summaries — both documents already exist (they were just
  // read, or just queried), and update fails loudly on a document that
  // vanished underneath us instead of silently resurrecting it.
  const writes = [
    ...targets.map((uid) => ({ ref: db.collection('users').doc(uid), data: { mascot: 'gena' } })),
    ...existingSummaries.map((ref) => ({ ref, data: { mascot: 'gena' } })),
    ...postRefs.map((ref) => ({ ref, data: { mascot: 'gena' } })),
  ];

  for (const group of chunk(writes, WRITE_BATCH)) {
    const batch = db.batch();
    for (const { ref, data } of group) batch.update(ref, data);
    await batch.commit();
  }

  return result;
});
