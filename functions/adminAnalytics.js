// The Admin dashboard's one data source: global counters plus the Power
// Users table, computed server-side and returned as a plain payload.
//
// WHY THIS IS A CALLABLE AND NOT CLIENT-SIDE FIRESTORE QUERIES
//
// The request was for getCountFromServer and an orderBy against `users`
// from the client. That cannot be authorised against this database, and
// not for a fixable reason:
//
//   * `users/{uid}` is readable by its owner and a connected trainer
//     only, and Firestore rejects a whole-collection query unless the
//     rule can be proven from the query's own filters. This is the same
//     wall userSearch.js hit and wrote up; nothing has changed.
//   * The per-user workout count does not live on `users/{uid}` at all.
//     It is `workoutCount` on users/{uid}/meta/records, whose rule is
//     `allow read: if isOwner(uid); allow write: if false` — so even a
//     rule that opened the parent doc to an admin email would not reach
//     the number the leaderboard ranks on.
//
// The alternative was a rules change granting one email read over every
// user document. That is a real option and it was rejected: it widens the
// blast radius of a stolen admin session from "whatever this function
// returns" to "the entire users collection, by direct REST call, forever",
// and it puts every account's email address behind a string comparison in
// a rules file instead of behind an Auth uid lookup. A callable keeps the
// Admin SDK where the Admin SDK already is in this codebase, and the
// client receives a chosen, minimal payload instead of documents.
//
// COST. One aggregation query, two counts, one capped scan of `users`,
// and one getAll over the same accounts' meta/records docs — so roughly
// 2N document reads plus four aggregations per dashboard load, N being
// the number of accounts. At this app's size (tens) that is nothing, and
// it is the identical trade userSearch.js documents. WHERE IT STOPS BEING
// TRUE: a few thousand accounts, at which point the fix is to denormalise
// `workoutCount` onto users/{uid} in logWorkout's existing write (it
// already touches that doc for lastWorkoutAt/currentStreak) and replace
// the scan below with orderBy + limit. Nothing in the client contract
// changes when that happens, which is the point of it being a callable.
const { onCall } = require('firebase-functions/v2/https');
const { getFirestore, AggregateField } = require('firebase-admin/firestore');
const { liveUidsOf } = require('./liveUsers');
const { requireAppAdmin } = require('./appAdmin');
const { tierForVolume } = require('./evolution');

const DEFAULT_ROWS = 20;
const MAX_ROWS = 50;
// Hard ceiling on the leaderboard scan, so one dashboard load can never
// become an unbounded read. The global counters above the table are
// aggregations and stay exact past this point — only the table itself
// truncates, and the payload says so (`truncated`) rather than quietly
// showing a top 20 drawn from a subset.
const MAX_SCAN = 2000;
// getAll takes the refs as varargs; chunked so a large project cannot
// build a single call with thousands of arguments.
const GETALL_CHUNK = 200;
const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Every account the table considers is checked against Auth, and the ones
// that no longer exist are dropped from the rows AND from the totals
// derived here. They are not merely hidden: `orphanedDocs` reports how
// many were found, because a growing number there is a real data-hygiene
// signal and silently swallowing it would be its own kind of lie. See
// liveUsers.js — the same check now guards the friend backfill, which
// would otherwise wire every ghost into Jimmy's friends list.

// Whole days between an ISO timestamp and now, or null. Used for the
// "dormant" column — a raw ISO string in a table of numbers is something
// the reader has to do arithmetic on.
function daysSince(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000)));
}

// Every metric is computed independently and allowed to fail on its own.
// An admin dashboard whose user count is unavailable should still show
// the coin float and the table — and more importantly, if a query ever
// does need an index Firestore has not built, the reason belongs on the
// card that is missing, not as a 500 that blanks the whole screen.
async function settle(fn) {
  try {
    return { value: await fn(), error: null };
  } catch (err) {
    return { value: null, error: err?.message ?? 'unavailable' };
  }
}

function clampRows(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_ROWS;
  return Math.min(n, MAX_ROWS);
}

exports.adminAnalytics = onCall(async (request) => {
  await requireAppAdmin(request);
  const db = getFirestore();

  const limit = clampRows(request.data?.limit);
  const sortBy = request.data?.sortBy === 'volume' ? 'volume' : 'workouts';
  const activeSince = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();

  const [userStats, workoutCount, feedPostCount, activeCount, scan] = await Promise.all([
    // Document count and coin float. Both exact regardless of MAX_SCAN
    // below, and issued as TWO aggregations on purpose.
    //
    // These used to share one `aggregate({ count, sum('coins') })` call,
    // on the reasoning that one round trip cannot disagree with itself
    // about which moment it describes. That reasoning was right and the
    // query was still wrong: an aggregation carrying a `sum(field)` runs
    // against that field's index, so its `count()` counts only the
    // documents that HAVE the field. Measured against this project's
    // feedPosts: `count()` alone returns 30, and `count()` beside a
    // `sum()` of a field no document has returns 0. Here it meant
    // `userDocs` reported 36 while the scan enumerated 49 real
    // documents — the 13 missing ones are accounts with no `coins` field
    // yet, and they are exactly the half-created docs this number exists
    // to surface. The impossible arithmetic on the dashboard (36 docs,
    // 33 orphaned, 16 live) is what gave it away.
    //
    // Split, `count()` stands alone and counts every document. The two
    // calls are still issued together, so the worst they can now differ
    // by is one in-flight signup.
    settle(async () => {
      const [countSnap, coinSnap] = await Promise.all([
        db.collection('users').count().get(),
        db.collection('users').aggregate({ coins: AggregateField.sum('coins') }).get(),
      ]);
      return {
        users: countSnap.data().count ?? 0,
        // Unchanged, and correct as it stands: a sum over documents
        // without the field is a sum of nothing to add.
        coins: Math.round(coinSnap.data().coins ?? 0),
      };
    }),
    // Workouts live at users/{uid}/workouts, so the real total is a
    // collection-group count. NOT feedPosts: a recovery workout
    // deliberately writes no feed post (see economy.js), so counting
    // posts would silently under-report exactly the sessions taken by
    // people coming back from a layoff — the group most worth seeing on
    // a health dashboard.
    settle(async () => (await db.collectionGroup('workouts').count().get()).data().count ?? 0),
    // Kept as its own number rather than dropped, because the gap between
    // the two IS a metric: posts/workouts is how much of what people do
    // they are willing to show their friends.
    settle(async () => (await db.collection('feedPosts').count().get()).data().count ?? 0),
    // `lastWorkoutAt` is an ISO-8601 string, and ISO-8601 sorts correctly
    // as bytes — which is why a string range works here at all. Same
    // query shape index.js's teaseLazyGoats already runs against this
    // field, in the opposite direction.
    settle(
      async () =>
        (await db.collection('users').where('lastWorkoutAt', '>=', activeSince).count().get()).data()
          .count ?? 0,
    ),
    settle(async () => {
      // select() still bills one read per document — Firestore bills
      // reads, not bytes — but it keeps the payload crossing the wire
      // proportional to what the table shows rather than to every
      // account's whole record (friends arrays, unlock lists, tokens).
      const usersSnap = await db
        .collection('users')
        .select(
          'displayName',
          'email',
          'coins',
          'currentStreak',
          'lastWorkoutAt',
          'role',
          'createdAt',
          'trainerId',
          'friends',
          'sharePRs',
          'badges',
        )
        .limit(MAX_SCAN)
        .get();

      // Which of these documents still have an account behind them. Done
      // before anything is computed, so an orphan can't reach a total.
      const live = await liveUidsOf(usersSnap.docs.map((d) => d.id));
      const liveDocs = usersSnap.docs.filter((d) => live.has(d.id));
      const orphanedDocs = usersSnap.size - liveDocs.length;

      // workoutCount and lifetimeVolume live one level down, on
      // meta/records. getAll with a fieldMask fetches exactly those two
      // fields for exactly these accounts — cheaper and far more precise
      // than a collectionGroup('meta') sweep, which would also drag back
      // every meta/economy and meta/profile doc in the database.
      const refs = liveDocs.map((d) => d.ref.collection('meta').doc('records'));
      const records = [];
      for (let i = 0; i < refs.length; i += GETALL_CHUNK) {
        const chunk = refs.slice(i, i + GETALL_CHUNK);
        if (chunk.length === 0) break;
        records.push(
          ...(await db.getAll(...chunk, { fieldMask: ['workoutCount', 'lifetimeVolume'] })),
        );
      }

      const rows = liveDocs.map((doc, i) => {
        const user = doc.data();
        const rec = records[i]?.exists ? records[i].data() : {};
        // The Auth record, which is the authoritative source for three
        // things the Firestore doc either lacks or lies about: whether the
        // address was ever confirmed, when the account was really created,
        // and when this person last actually signed in. `createdAt` on the
        // user doc is written by the client at signup; Auth's is not.
        const authUser = live.get(doc.id);
        const volume = Math.round(Number(rec.lifetimeVolume) || 0);
        const tier = tierForVolume(volume, { minStage: user.role === 'trainer' ? 2 : 1 });
        return {
          uid: doc.id,
          displayName: user.displayName ?? 'Unnamed',
          // The whole point of the table, per the request: somewhere to
          // start a conversation with the people actually using this.
          // Present on every account (written at signup, see useAuth) but
          // defaulted anyway — a missing address should render as a dash,
          // not as the string "undefined".
          email: user.email ?? null,
          role: user.role ?? 'lifter',
          workouts: Number(rec.workoutCount) || 0,
          // Cumulative Relative Strength Volume, NOT kilograms — see
          // records.js's lifetimeVolumeOf. The UI labels it accordingly;
          // calling it kg on an admin screen would quietly invent a unit
          // and make these numbers look absurd next to the feed's.
          volume,
          currentStreak: Number(user.currentStreak) || 0,
          coins: Number(user.coins) || 0,
          lastWorkoutAt: user.lastWorkoutAt ?? null,
          // Days since the last logged session — the column that actually
          // answers "is this person still here". null = never logged one.
          dormantDays: daysSince(user.lastWorkoutAt),
          // Where their goat is on the ladder. Same table the app draws
          // from (functions/evolution.js), so this can never disagree with
          // what the user sees on their own home screen.
          tier: tier.label,
          stage: tier.stage,
          // From Auth, not the user doc — see the comment above.
          emailVerified: authUser?.emailVerified === true,
          disabled: authUser?.disabled === true,
          createdAt: authUser?.metadata?.creationTime ?? user.createdAt ?? null,
          lastSignInAt: authUser?.metadata?.lastSignInTime ?? null,
          friends: Array.isArray(user.friends) ? user.friends.length : 0,
          badges: Array.isArray(user.badges) ? user.badges.length : 0,
          sharePRs: user.sharePRs === true,
          hasTrainer: Boolean(user.trainerId),
        };
      });

      // Sorted in memory because the two ranking fields live in different
      // documents — no single Firestore query can order by them. Ties
      // break on the other metric so the list has a stable, meaningful
      // order instead of reshuffling by document id.
      const key = sortBy === 'volume' ? 'volume' : 'workouts';
      const tie = sortBy === 'volume' ? 'workouts' : 'volume';
      rows.sort((a, b) => b[key] - a[key] || b[tie] - a[tie]);

      // ── Totals, from the LIVE population only ───────────────────────
      //
      // Derived from the same scanned set the table is drawn from rather
      // than from a separate aggregation, so every number on the dashboard
      // describes the same group of people. The exact document count from
      // the aggregation is still reported alongside (`userDocs`) — the gap
      // between the two IS the orphan count, and showing both is what
      // makes that number checkable instead of something to take on faith.
      const sum = (pick) => rows.reduce((n, r) => n + pick(r), 0);
      const newSince = Date.parse(activeSince);
      const breakdown = {
        liveUsers: rows.length,
        orphanedDocs,
        coins: sum((r) => r.coins),
        volume: sum((r) => r.volume),
        workouts: sum((r) => r.workouts),
        emailVerified: rows.filter((r) => r.emailVerified).length,
        disabled: rows.filter((r) => r.disabled).length,
        onStreak: rows.filter((r) => r.currentStreak >= 2).length,
        neverTrained: rows.filter((r) => r.dormantDays === null).length,
        // Signed up inside the same 7-day window the "active" card uses,
        // so growth and engagement are measured over identical spans.
        newLast7Days: rows.filter((r) => {
          const ms = Date.parse(r.createdAt);
          return Number.isFinite(ms) && Number.isFinite(newSince) && ms >= newSince;
        }).length,
        signedInLast7Days: rows.filter((r) => {
          const ms = Date.parse(r.lastSignInAt);
          return Number.isFinite(ms) && Number.isFinite(newSince) && ms >= newSince;
        }).length,
        trainers: rows.filter((r) => r.role === 'trainer').length,
        withTrainer: rows.filter((r) => r.hasTrainer).length,
        sharingPRs: rows.filter((r) => r.sharePRs).length,
        // Head-count per evolution stage, low to high. The shape of the
        // ladder is the single most useful thing on a progression app's
        // health screen: a base that never reaches stage 2 is a different
        // problem from one that stalls at stage 3.
        byStage: [1, 2, 3, 4].map((stage) => ({
          stage,
          count: rows.filter((r) => r.stage === stage).length,
        })),
      };

      return {
        rows: rows.slice(0, limit),
        breakdown,
        scanned: usersSnap.size,
        truncated: usersSnap.size >= MAX_SCAN,
      };
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    sortBy,
    activeSince,
    totals: {
      // LIVE accounts — documents with an Auth record still behind them.
      // This is the headline number, and it is deliberately not the raw
      // document count: a dashboard that counts deleted users is a
      // dashboard that reports a user base it does not have.
      users: scan.value ? scan.value.breakdown.liveUsers : null,
      // The raw document count, kept so the two are comparable.
      userDocs: userStats.value?.users ?? null,
      // Documents with no Auth account behind them any more. Non-zero
      // means a console deletion left data behind — see liveUidsOf.
      orphanedDocs: scan.value ? scan.value.breakdown.orphanedDocs : null,
      // Coins held by live accounts only. Differs from the raw sum over
      // every document whenever orphanedDocs is non-zero.
      coins: scan.value ? scan.value.breakdown.coins : null,
      coinsAllDocs: userStats.value?.coins ?? null,
      workouts: workoutCount.value,
      feedPosts: feedPostCount.value,
      activeLast7Days: activeCount.value,
      newLast7Days: scan.value ? scan.value.breakdown.newLast7Days : null,
      signedInLast7Days: scan.value ? scan.value.breakdown.signedInLast7Days : null,
      emailVerified: scan.value ? scan.value.breakdown.emailVerified : null,
      disabled: scan.value ? scan.value.breakdown.disabled : null,
      onStreak: scan.value ? scan.value.breakdown.onStreak : null,
      neverTrained: scan.value ? scan.value.breakdown.neverTrained : null,
      trainers: scan.value ? scan.value.breakdown.trainers : null,
      withTrainer: scan.value ? scan.value.breakdown.withTrainer : null,
      sharingPRs: scan.value ? scan.value.breakdown.sharingPRs : null,
      totalVolume: scan.value ? scan.value.breakdown.volume : null,
      byStage: scan.value ? scan.value.breakdown.byStage : null,
    },
    // One entry per metric that could not be computed, keyed the same way
    // as `totals`, so the card can say what went wrong instead of showing
    // a confident zero. A zero and a failure look identical otherwise,
    // and on a health dashboard that is the worst possible ambiguity.
    errors: {
      ...(userStats.error ? { users: userStats.error, coins: userStats.error } : {}),
      ...(workoutCount.error ? { workouts: workoutCount.error } : {}),
      ...(feedPostCount.error ? { feedPosts: feedPostCount.error } : {}),
      ...(activeCount.error ? { activeLast7Days: activeCount.error } : {}),
      ...(scan.error ? { powerUsers: scan.error } : {}),
    },
    powerUsers: scan.value?.rows ?? [],
    scanned: scan.value?.scanned ?? 0,
    truncated: scan.value?.truncated ?? false,
  };
});
