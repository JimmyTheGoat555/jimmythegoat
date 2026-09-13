// The coin economy's ONLY entry points. Everything here runs with the
// Admin SDK (bypasses firestore.rules entirely) precisely so it can be the
// one trusted place that validates a workout and grants coins — the client
// SDK is never allowed to write users/{uid}.coins or a workout's
// coinsEarned/verified fields directly (see firestore.rules). A client
// calling logWorkout()/purchaseItem() with a forged payload gets the exact
// same validation a legitimate app call would; there's no "trust the
// client, double check later" step anywhere in here.
const { randomUUID } = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const {
  findNewPersonalRecordsFromBest,
  buildRecordsSnapshot,
  applyWorkoutToRecords,
  publishableRecord,
} = require('./records');
const { evaluateBadges } = require('./badges');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const {
  MIN_WEIGHT_KG,
  MAX_WEIGHT_KG,
  MIN_REPS,
  MAX_REPS,
  MAX_ADDED_WEIGHT_KG,
  MIN_BODYWEIGHT_KG,
  MAX_BODYWEIGHT_KG,
  MAX_SETS_PER_WORKOUT,
  MAX_EXERCISES_PER_WORKOUT,
  MAX_STARTED_AT_AGE_MS,
  WINDOW_MS,
  MIN_GAP_MS,
  MAX_WORKOUTS_PER_WINDOW,
  NEGLECT_RECOVERY_MS,
  RECOVERY_MIN_SCORE,
  COINS_PER_RELATIVE_POINT,
  MAX_COINS_PER_WORKOUT,
  STORE_ITEMS_BY_ID,
  STARTER_DANCE_ID,
} = require('./storeCatalog');
const { BODYWEIGHT_EXERCISE_IDS } = require('./exercises');

const round1 = (n) => Math.round(Number(n) * 10) / 10;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

const DAY_MS = 24 * 60 * 60 * 1000;
// How long a streak survives between sessions. Three days, so one skipped
// gym day — or a weekend — does not wipe a run. Deliberately forgiving:
// this number exists to make people come back, and a streak that punishes
// a single rest day mostly teaches them the streak is not worth chasing.
const STREAK_GAP_MS = 3 * DAY_MS;

// Re-validates and re-computes every set server-side — the client's own
// clamped inputs (see SetRow.jsx) are a UX nicety, not a security boundary.
// Throws HttpsError('invalid-argument', ...) the instant anything is out of
// bounds; the whole workout is rejected rather than silently dropping the
// bad set, so nothing gets partial credit for a tampered payload.
//
// `bodyWeightKg` is the lifter's latest logged body weight — REQUIRED now,
// because the score is strength-relative: every set contributes
// `relativeVolume = (effectiveLoad / bodyWeight) * reps`, where
// effectiveLoad is the entered weight, or (bodyWeight + belt) for an
// exercise in BODYWEIGHT_EXERCISE_IDS. `totalScore` (sum of relativeVolume)
// drives coins + the lifetime total + evolution tiers. `totalVolumeKg`
// (the old raw sum) is kept only for the feed card's "how much did they
// lift" number. Each stored set keeps `weight` (entered, or bodyWeight +
// belt) for display/PRs plus `relativeVolume` for cumulative sums.
function validateAndScoreWorkout(exercises, bodyWeightKg) {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    throw new HttpsError('invalid-argument', 'A workout needs at least one exercise.');
  }
  // Bounds the ARRAY itself, before any per-exercise work runs — a huge
  // payload of empty/near-empty exercise objects would otherwise still
  // cost a full iteration (and a large request body) before the
  // per-exercise checks below ever got a chance to reject anything.
  // MAX_SETS_PER_WORKOUT alone doesn't catch this: it only bounds
  // COMPLETED sets, and an exercise with zero sets is silently dropped
  // rather than rejected.
  if (exercises.length > MAX_EXERCISES_PER_WORKOUT) {
    throw new HttpsError(
      'invalid-argument',
      `A single workout can't include more than ${MAX_EXERCISES_PER_WORKOUT} exercises.`,
    );
  }
  if (!Number.isFinite(bodyWeightKg) || bodyWeightKg <= 0) {
    throw new HttpsError(
      'failed-precondition',
      'Add your body weight in Profile — Jimmy scores every workout by strength-to-bodyweight now.',
    );
  }
  // Clamp the scoring divisor so a tampered-low body weight can't inflate
  // relative volume (see storeCatalog.js).
  const bw = Math.min(MAX_BODYWEIGHT_KG, Math.max(MIN_BODYWEIGHT_KG, bodyWeightKg));

  let totalScore = 0;
  let totalVolumeKg = 0;
  let totalSets = 0;
  const cleanExercises = [];

  for (const exercise of exercises) {
    if (!exercise || typeof exercise.exerciseId !== 'string' || !Array.isArray(exercise.sets)) {
      throw new HttpsError('invalid-argument', 'Malformed exercise entry.');
    }

    // Trusted from the server's own list, never the client payload.
    const isBodyweight = BODYWEIGHT_EXERCISE_IDS.has(exercise.exerciseId);
    const exName = typeof exercise.name === 'string' ? exercise.name.slice(0, 200) : exercise.exerciseId;

    const cleanSets = [];
    for (const rawSet of exercise.sets) {
      // Sets left un-checked in the UI (weight/reps typed but never marked
      // complete) don't count toward the workout at all — same as today.
      if (!rawSet?.completed) continue;

      totalSets += 1;
      if (totalSets > MAX_SETS_PER_WORKOUT) {
        throw new HttpsError('invalid-argument', `A single workout can't log more than ${MAX_SETS_PER_WORKOUT} sets.`);
      }

      const reps = Number(rawSet.reps);
      if (!Number.isInteger(reps) || reps < MIN_REPS || reps > MAX_REPS) {
        throw new HttpsError('invalid-argument', `Reps must be a whole number between ${MIN_REPS} and ${MAX_REPS} — got ${rawSet.reps}.`);
      }

      let effectiveWeight;
      let addedWeight = 0;
      if (isBodyweight) {
        // A bodyweight exercise: the entered `weight` is meaningless (the
        // client sends 0 / blank), so it is NOT range-checked against
        // MIN/MAX_WEIGHT_KG. Only the belt (`addedWeight`) is bounded, and
        // the load is body weight + belt — NOT clamped to 250, so a pure
        // bodyweight rep's ratio stays exactly body/body = 1.
        addedWeight = round1(rawSet.addedWeight || 0);
        if (!Number.isFinite(addedWeight) || addedWeight < 0 || addedWeight > MAX_ADDED_WEIGHT_KG) {
          throw new HttpsError('invalid-argument', `Added weight must be between 0 and ${MAX_ADDED_WEIGHT_KG} kg — got ${rawSet.addedWeight}.`);
        }
        effectiveWeight = round1(bw + addedWeight);
      } else {
        // Weighted exercise: the entered weight IS range-checked.
        // Quantized to 0.1 kg — the wheel picker (src/utils/units.js) steps
        // in 0.1; a client sending float noise (60.04999) or finer
        // precision can't smuggle in a weird value.
        effectiveWeight = round1(rawSet.weight);
        if (!Number.isFinite(effectiveWeight) || effectiveWeight < MIN_WEIGHT_KG || effectiveWeight > MAX_WEIGHT_KG) {
          throw new HttpsError('invalid-argument', `Weight must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg — got ${rawSet.weight}.`);
        }
      }

      // Strength-relative: (load ÷ body weight) × reps.
      const relativeVolume = round2((effectiveWeight / bw) * reps);
      totalScore += relativeVolume;
      totalVolumeKg += effectiveWeight * reps;

      // A missing id crashes the write below with a 500 (the Admin SDK
      // rejects `undefined` outright — found live during a security audit,
      // via a call that omitted it) — the real app's client always sends
      // one, but this is the actual validation boundary, so it has to cope
      // with a call that doesn't.
      cleanSets.push({
        id: typeof rawSet.id === 'string' ? rawSet.id : randomUUID(),
        weight: effectiveWeight,
        reps,
        relativeVolume,
        completed: true,
        // A drop set: same exercise, immediately after the previous set at
        // a lower load, no rest between. Purely descriptive — it scores
        // exactly like any other completed set, because it IS one. Written
        // only when true so an ordinary set's document does not grow a
        // `false` on every row of every workout forever.
        //
        // This has to be named here or it does not exist. Every set is
        // rebuilt field-by-field from scratch a few lines up rather than
        // spread from the client's object, so anything not listed is
        // dropped — silently, and with no error the client could notice.
        ...(rawSet.isDropSet === true ? { isDropSet: true } : {}),
        ...(isBodyweight ? { isBodyweight: true, addedWeight, bodyWeightAtLog: round1(bw) } : {}),
      });
    }

    if (cleanSets.length === 0) continue; // an exercise with nothing completed just doesn't count

    cleanExercises.push({
      exerciseId: exercise.exerciseId,
      name: exName,
      muscleGroup: typeof exercise.muscleGroup === 'string' ? exercise.muscleGroup.slice(0, 60) : null,
      sets: cleanSets,
      // Superset membership. Adjacent exercises carrying the same id were
      // performed back-to-back. An opaque grouping token, never displayed
      // and only ever compared for equality — but still client-supplied
      // and still stored, so it is type-checked and length-bounded like
      // every other free-form string that reaches a document here.
      //
      // Note what is NOT enforced: that the id is shared by an ADJACENT
      // exercise. An exercise dropped for having no completed sets can
      // leave a one-member group behind, and the reader treats a group of
      // one as an ordinary exercise, which is the correct reading of what
      // actually happened.
      ...(typeof exercise.supersetId === 'string' && exercise.supersetId
        ? { supersetId: exercise.supersetId.slice(0, 64) }
        : {}),
      ...(isBodyweight ? { isBodyweight: true } : {}),
    });
  }

  if (cleanExercises.length === 0) {
    throw new HttpsError('invalid-argument', 'Log at least one completed set to finish a workout.');
  }

  totalScore = round2(totalScore);
  const coinsEarned = Math.min(MAX_COINS_PER_WORKOUT, Math.round(totalScore * COINS_PER_RELATIVE_POINT));
  return { cleanExercises, totalScore, totalVolumeKg: Math.round(totalVolumeKg), coinsEarned };
}

// "3542s" is unreadable for a wait that can now run up to an hour or most
// of a day — this is only ever used for the rolling-window wait messages
// below, so it never needs to handle much beyond a day.
function formatWait(ms) {
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// `startedAt` only ever drives the DISPLAYED workout duration (finishedAt
// minus startedAt) — it never touches scoring or coins — but an
// unvalidated client timestamp still lets someone claim a 6-hour "beast
// mode" session that was actually 10 seconds, or the reverse. Reject
// anything in the future (clock can't run backwards from the server's own
// `now`) or further back than MAX_STARTED_AT_AGE_MS, falling back to the
// server's own finishedAt — i.e. a zero-duration workout — rather than
// rejecting the whole log over a cosmetic field.
function sanitizeStartedAt(startedAt, finishedAtIso, now) {
  if (typeof startedAt !== 'string') return finishedAtIso;
  const ms = Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms > now || ms < now - MAX_STARTED_AT_AGE_MS) return finishedAtIso;
  return startedAt;
}

// Same "first exercise + N more" shorthand WorkoutSummaryModal.jsx already
// uses for a template's default name — duplicated rather than shared
// across the functions/src boundary for four lines of logic.
function headline(exercises) {
  const names = exercises.map((e) => e.name);
  if (names.length === 0) return 'Workout';
  if (names.length <= 2) return names.join(' + ');
  return `${names[0]} + ${names.length - 1} more`;
}

// Callable from the client via httpsCallable(functions, 'logWorkout') — see
// useEconomy.js. Validates the workout, enforces the cooldown + daily cap,
// writes the workout doc, and credits coins, all inside one transaction so
// a retry or a race between two calls from the same account can never
// double-pay or log two workouts inside the cooldown window.
exports.logWorkout = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const { exercises, assignedWorkoutId, startedAt, sharePersonalRecords } = request.data ?? {};

  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);

  // Latest logged body weight, for scoring bodyweight exercises (see
  // validateAndScoreWorkout). users/{uid}/meta/profile.bodyWeightLog is
  // newest-first (useCloudProfile.js prepends); signup seeds entry 0 from
  // the onboarding weight, so most accounts have one. Read outside the
  // transaction — body weight barely moves and a few minutes' staleness is
  // fine.
  const profileSnap = await userRef.collection('meta').doc('profile').get();
  const bwLog = profileSnap.data()?.bodyWeightLog;
  const bodyWeightKg = Array.isArray(bwLog) && bwLog.length ? Number(bwLog[0]?.weight) : null;

  const { cleanExercises, totalScore, totalVolumeKg, coinsEarned } = validateAndScoreWorkout(
    exercises,
    bodyWeightKg,
  );

  const economyRef = userRef.collection('meta').doc('economy');
  const workoutRef = userRef.collection('workouts').doc();
  // Top-level, NOT users/{uid}/feedPosts — the whole point is that other
  // people's clients can query across everyone's posts at once
  // (where('userId','in', myFriends)), which only works against a single
  // shared collection. Named distinctly from users/{uid}/workouts (the
  // full private log with real per-set data) rather than reusing
  // "workouts" for this lightweight public summary, so the two don't get
  // confused reading the code six months from now.
  const feedPostRef = db.collection('feedPosts').doc();

  // The account's aggregate stats — best lift per exercise, lifetime
  // relative volume, workout count, current day-streak, highest single-set
  // score ever. Read outside the transaction: staleness of a few minutes
  // is fine (same tolerance the old code already accepted here), and the
  // per-user cooldown a few lines down means the same account can't be
  // logging two workouts concurrently for it to race with.
  //
  // This used to be `userRef.collection('workouts').get()` — the account's
  // ENTIRE workout history, re-read and re-scanned on EVERY single log.
  // Fine at a handful of workouts, a real Firestore-billing and latency
  // risk once real users have hundreds. loadRecords() below only ever
  // pays that full-scan cost ONCE per account (bootstrapping
  // meta/records the first time it's missing); every log after that reads
  // one small aggregate doc and folds this workout onto it in memory — see
  // records.js's buildRecordsSnapshot / applyWorkoutToRecords.
  const recordsRef = userRef.collection('meta').doc('records');
  const recordsSnap = await recordsRef.get();
  const records = recordsSnap.exists
    ? recordsSnap.data()
    : buildRecordsSnapshot((await userRef.collection('workouts').get()).docs.map((d) => d.data()));

  const personalRecords = findNewPersonalRecordsFromBest(cleanExercises, records.bestPerExercise);

  const now = Date.now();

  // Set inside the transaction (they depend on the authoritative
  // economy-doc read there), used again in the return below — hoisted so
  // both scopes can see them.
  let isRecovery = false;
  let neglectPenaltyLifted = true;
  let effectiveCoins = coinsEarned;
  let effectiveRecords = personalRecords;
  let newBadges = [];
  let firstWorkoutReward = null;
  let currentStreak = 0;

  await db.runTransaction(async (tx) => {
    const [userSnap, economySnap] = await Promise.all([tx.get(userRef), tx.get(economyRef)]);
    if (!userSnap.exists) throw new HttpsError('failed-precondition', "Your profile doc doesn't exist yet — try again in a moment.");

    // Rolling window, not a UTC-midnight reset: stored as the timestamps of
    // recent logs rather than a count, because "2 in the last 24 hours"
    // has to be checked at the moment of THIS request, not since some fixed
    // clock boundary — a counter that resets at midnight would let someone
    // log at 23:59 and again at 00:01, ninety seconds apart. Kept sorted
    // oldest-first, which is also the order they're written back in below.
    const economy = economySnap.exists ? economySnap.data() : {};
    const stored = Array.isArray(economy.recentWorkoutLogs) ? economy.recentWorkoutLogs : [];
    const recent = stored
      .map((iso) => Date.parse(iso))
      .filter((ms) => Number.isFinite(ms) && now - ms < WINDOW_MS)
      .sort((a, b) => a - b);

    if (recent.length > 0) {
      const sinceLast = now - recent[recent.length - 1];
      if (sinceLast < MIN_GAP_MS) {
        throw new HttpsError(
          'resource-exhausted',
          `Take a breather — you can log another workout in ${formatWait(MIN_GAP_MS - sinceLast)}.`,
        );
      }
    }
    if (recent.length >= MAX_WORKOUTS_PER_WINDOW) {
      // The window frees up one slot at a time, as each old entry ages
      // past 24h — the oldest is always next to go.
      const freesInMs = recent[0] + WINDOW_MS - now;
      throw new HttpsError(
        'resource-exhausted',
        `You've logged ${MAX_WORKOUTS_PER_WINDOW} workouts in the last 24 hours — the next slot opens in ${formatWait(freesInMs)}.`,
      );
    }

    const finishedAtIso = new Date(now).toISOString();

    // Neglect / comeback: if it has been NEGLECT_RECOVERY_MS or more since
    // the last logged workout, THIS one is a recovery workout — it earns
    // no coins, adds nothing to lifetime volume/records, sets no PRs, and
    // doesn't post to the feed, regardless of how it scores. Requires a
    // PRIOR workout: a brand-new account's very first workout (no
    // lastWorkoutAt) is never a "recovery".
    const lastWorkoutMs = Date.parse(economy.lastWorkoutAt);
    isRecovery = Number.isFinite(lastWorkoutMs) && now - lastWorkoutMs >= NEGLECT_RECOVERY_MS;
    effectiveCoins = isRecovery ? 0 : coinsEarned;
    effectiveRecords = isRecovery ? [] : personalRecords;

    // A recovery workout only lifts the neglect penalty (refreshes
    // lastWorkoutAt) if it clears a real minimum-effort bar
    // (RECOVERY_MIN_SCORE). Without this, the cheapest possible workout —
    // one set, one rep — was exactly as good at resetting the clock as a
    // real session: log a 10-second throwaway to lift the penalty, then a
    // genuine workout right after for full, un-penalised rewards. A
    // recovery workout that doesn't clear the bar leaves the OLD
    // lastWorkoutAt untouched, so the NEXT log is judged against that same
    // stale timestamp — still "overdue" — until one actually clears it.
    neglectPenaltyLifted = !isRecovery || totalScore >= RECOVERY_MIN_SCORE;

    // ── Workout streak ──────────────────────────────────────────────────
    //
    // NOT the same number as meta/records' `streakDays`, and that is
    // intentional rather than an oversight. `streakDays` is strict
    // consecutive calendar days and feeds the streak-7 badge (records.js);
    // this one tolerates a three-day gap and drives the fire on Jimmy. An
    // achievement should be hard to earn; a comeback hook should be hard
    // to lose. Same word, two jobs.
    //
    // Gated on neglectPenaltyLifted for the same reason lastWorkoutAt is,
    // and the coupling is load-bearing: the streak is measured FROM
    // lastWorkoutAt, so if a below-the-bar comeback workout leaves that
    // timestamp stale, the streak has to stay frozen with it. Advancing
    // one without the other would judge the NEXT log against a gap that
    // never happened.
    //
    // A second workout on the same UTC day HOLDS the streak instead of
    // advancing it — the identical rule applyWorkoutToRecords already
    // applies to streakDays, and the reason is the same: without it the
    // number counts sessions rather than days, and the 2-per-24h cap
    // would let a two-a-day lifter run a streak at double everyone else's
    // rate against a calendar nobody shares.
    const priorStreak = Number(userSnap.data().currentStreak) || 0;
    const brokeStreak = !Number.isFinite(lastWorkoutMs) || now - lastWorkoutMs > STREAK_GAP_MS;
    const sameUtcDay =
      Number.isFinite(lastWorkoutMs) && Math.floor(now / DAY_MS) === Math.floor(lastWorkoutMs / DAY_MS);
    currentStreak = !neglectPenaltyLifted
      ? priorStreak
      : brokeStreak
        ? 1
        : sameUtcDay
          ? Math.max(priorStreak, 1)
          : priorStreak + 1;

    tx.set(workoutRef, {
      exercises: cleanExercises,
      // Bounded to [now - 48h, now] — see sanitizeStartedAt. Never fed
      // into scoring/coins, only the displayed workout duration.
      startedAt: sanitizeStartedAt(startedAt, finishedAtIso, now),
      finishedAt: finishedAtIso,
      assignedWorkoutId: typeof assignedWorkoutId === 'string' ? assignedWorkoutId : null,
      // Marks this doc as having come through server validation + reward —
      // see firestore.rules for why a directly client-written workout
      // (still possible for personal history edits) can never carry this.
      verified: true,
      coinsEarned: effectiveCoins,
      // Relative Strength Volume for this workout (sum of every set's
      // relativeVolume). The lifetime total sums this across history; the
      // per-set values are kept too so an edited/legacy workout can still
      // be re-summed. A recovery workout stores its score but it's
      // excluded from the lifetime sum (see records.js / workoutStats.js).
      score: isRecovery ? 0 : totalScore,
      // The raw kg tonnage — feed card display only, never the progression.
      totalVolumeKg,
      // Excluded from lifetime volume + PR math everywhere it's summed
      // (records.js, src/utils/workoutStats.js, src/utils/personalRecords.js).
      recoveryWorkout: isRecovery,
    });

    const economyUpdate = {
      // .slice(-MAX_WORKOUTS_PER_WINDOW): `recent` is already filtered to
      // the live window and gated at < MAX_WORKOUTS_PER_WINDOW above, so
      // this never actually trims anything today — it is a deliberate
      // second line of defense that keeps the array from growing without
      // bound if this constant is ever raised later without a migration.
      // Appended regardless of neglectPenaltyLifted — the rate limit still
      // applies to a below-the-bar recovery attempt.
      recentWorkoutLogs: [...recent, now].slice(-MAX_WORKOUTS_PER_WINDOW).map((ms) => new Date(ms).toISOString()),
    };
    // The authoritative "when did this user last train" — only advanced
    // when neglectPenaltyLifted, so an under-the-bar recovery attempt
    // can't quietly reset the 5-day clock for free (see above).
    if (neglectPenaltyLifted) economyUpdate.lastWorkoutAt = finishedAtIso;
    tx.set(economyRef, economyUpdate, { merge: true });

    if (effectiveCoins > 0) {
      tx.update(userRef, { coins: FieldValue.increment(effectiveCoins) });
    }

    // Mirror of economyRef.lastWorkoutAt onto the user doc itself — same
    // neglectPenaltyLifted gate as above. The economy-doc copy is read by
    // this same function for the recovery check; this copy exists so the
    // daily re-engagement job (functions/index.js's teaseLazyGoats) can
    // find idle users with one indexed range query on `users` instead of
    // fetching every user's meta/economy subdoc. Server-only — see
    // firestore.rules' serverManagedFieldsUnchanged().
    if (neglectPenaltyLifted) {
      // currentStreak rides along with lastWorkoutAt, in the same write,
      // because the two are only meaningful together — see the streak
      // block above. Server-only: `currentStreak` is absent from
      // firestore.rules' userUpdateFieldsAllowed() allowlist, and that
      // allowlist is hasOnly(), so a client write touching this field is
      // already denied without the rule needing to name it.
      tx.set(userRef, { lastWorkoutAt: finishedAtIso, currentStreak }, { merge: true });
    }

    const userData = userSnap.data();

    // Fold this workout onto the account's aggregate stats — a recovery
    // workout touches nothing here (same rule the old full-scan
    // bestWeightPerExercise/lifetimeVolumeOf already enforced). This
    // REPLACES the old "re-scan full history into `allWorkouts`" step —
    // nextRecords already IS the up-to-date aggregate, no scan needed.
    const nextRecords = applyWorkoutToRecords(records, {
      cleanExercises,
      finishedAtIso,
      totalScore,
      totalVolumeKg,
      isRecovery,
    });
    tx.set(recordsRef, { ...nextRecords, updatedAt: finishedAtIso });

    // Achievement badges (see functions/badges.js + src/data/records.js).
    // Derived from nextRecords — never a history re-scan — and only ever
    // ADDED (arrayUnion), so a badge earned once stays earned. A recovery
    // workout awards nothing, same as coins/PRs.
    //
    // Resolved ABOVE the summary write, not after it, for the same reason
    // the Silver Lootbox grant is: the summary publishes `badges`, and a
    // trophy earned by THIS workout would otherwise not reach a friend's
    // shelf until the next one.
    const heldBadges = Array.isArray(userData.badges) ? userData.badges : [];
    const heldBadgeIds = new Set(heldBadges.map((b) => (typeof b === 'string' ? b : b?.id)));
    newBadges = isRecovery
      ? []
      : [...evaluateBadges(nextRecords, { bodyWeightKg })].filter((id) => !heldBadgeIds.has(id));
    const awardedBadges = [...heldBadges, ...newBadges.map((id) => ({ id, at: finishedAtIso }))];
    if (newBadges.length > 0) {
      tx.update(userRef, {
        badges: FieldValue.arrayUnion(...newBadges.map((id) => ({ id, at: finishedAtIso }))),
      });
    }

    // Resolved here rather than read straight off userData because the
    // Silver Lootbox below may add to it in this very transaction — and
    // the summary is written before that runs. Publishing the pre-grant
    // list would hide a brand-new account's free dance from friends until
    // their SECOND workout.
    const ownedDances = Array.isArray(userData.unlockedDances) ? [...userData.unlockedDances] : [];
    const grantsStarterDance =
      !isRecovery && (records.workoutCount ?? 0) === 0 && !ownedDances.includes(STARTER_DANCE_ID);
    if (grantsStarterDance) ownedDances.push(STARTER_DANCE_ID);

    // Refresh the friend-visible profile summary — see publicProfile.js.
    // `sharePersonalRecords` below is a one-off, per-post consent ("call
    // out this workout's PR in the feed"); `userData.sharePRs` is the
    // standing profile-level consent ("let friends see my current
    // all-time bests at all"). They are deliberately independent.
    //
    // `unlockedDances` rides along because a friend's profile lets a
    // visitor play the dances someone owns (FriendDancesModal.jsx), and
    // the authoritative list lives on the private users/{uid} doc no
    // friend can read. It is cosmetic only — which emotes they own, not
    // what they lift, spend or weigh — and being seen is the entire point
    // of a showcase, so it is published deliberately and has no opt-out
    // flag the way personalRecords does. Server-written only: the
    // client-update rule on public/summary still allows exactly the three
    // equipped fields, so nobody can claim a dance they never unlocked.
    const summary = {
      displayName: userData.displayName ?? 'Someone',
      lifetimeVolume: Math.round(nextRecords.lifetimeVolume),
      sharePRs: userData.sharePRs === true,
      unlockedDances: ownedDances,
      // So a friend's profile can set Jimmy alight too. Published
      // unconditionally, like the tier: a streak is a boast, not a
      // measurement of what you lifted, and there is nothing in the
      // number to opt out of.
      currentStreak,
      // The stage this account's goat starts at — 2 for a coach. Published
      // as a NUMBER rather than the raw `role`, because a friend's profile
      // only needs "draw them from buff up", not "this person is a
      // trainer". Same field either way in practice, but the narrow one is
      // the one that cannot grow a second meaning later.
      minStage: userData.role === 'trainer' ? 2 : 1,
      // Trophies are for showing. Published as the same { id, at } shape
      // the private doc holds, so a friend's shelf and your own read one
      // format — and ids only, no thresholds or lift numbers, so a badge
      // never discloses what it took to earn beyond its own name.
      badges: awardedBadges,
    };
    if (userData.sharePRs === true) {
      summary.personalRecords = Object.entries(nextRecords.bestPerExercise).map(([exerciseId, r]) =>
        publishableRecord(exerciseId, r),
      );
    }
    tx.set(userRef.collection('public').doc('summary'), summary, { merge: true });

    // The Silver Lootbox: a brand-new account's very first REAL workout
    // (records.workoutCount is the count BEFORE this one folded in, and a
    // recovery workout requires a prior workout to exist at all — so
    // `!isRecovery && workoutCount === 0` can only be true once, ever, per
    // account) grants one free dance instead of quietly landing in
    // unlockedDances with no fanfare. The client shows this as a
    // full-screen chest-opening moment (see SilverLootboxModal.jsx) rather
    // than folding it into the normal "+N coins" toast.
    //
    // Both the condition and the resulting list are resolved above, next
    // to the summary write, so the published showcase and the real grant
    // can never disagree about what this account owns.
    if (grantsStarterDance) {
      tx.update(userRef, { unlockedDances: FieldValue.arrayUnion(STARTER_DANCE_ID) });
      const starterItem = STORE_ITEMS_BY_ID.get(STARTER_DANCE_ID);
      firstWorkoutReward = { itemId: STARTER_DANCE_ID, name: starterItem?.name ?? 'A new dance', emoji: starterItem?.emoji ?? '🎁' };
    }

    // A recovery workout is a private "get back on the horse" — no feed
    // post (it earns nothing and has no PRs to call out; a "0 kg · +0
    // coins" card would just be noise, and it keeps friends' weekly
    // leaderboard totals consistent with the no-reward rule).
    if (!isRecovery) {
      // Cosmetics are snapshotted as of THIS workout rather than read live
      // later, so a friend's feed card shows what you were wearing when
      // you actually did it (and never needs read access to your full,
      // otherwise-private profile doc to display them).
      tx.set(feedPostRef, {
        userId: uid,
        userName: userData.displayName ?? 'Someone',
        headline: headline(cleanExercises),
        exerciseCount: cleanExercises.length,
        totalSets: cleanExercises.reduce((sum, e) => sum + e.sets.length, 0),
        // Kept as raw kg for the feed card — "500 kg this week" reads
        // better on a friend's card than a relative score would.
        totalVolume: totalVolumeKg,
        // The poster's lifetime total AFTER this workout — lets the feed
        // card draw them at the evolution tier they were actually at when
        // they posted, rather than guessing a stage. Cheap: already
        // computed for records, and the card needs it to pick a sprite.
        lifetimeVolume: nextRecords.lifetimeVolume ?? 0,
        // Relative Strength Volume for this workout — what the weekly
        // leaderboard now ranks on, so a lighter lifter isn't buried by a
        // heavier friend's raw tonnage. Written with the same
        // `isRecovery ? 0 : totalScore` shape as the workout doc; a
        // recovery workout never reaches this branch (no feed post) but
        // the guard is kept explicit so the two writes can't drift.
        score: isRecovery ? 0 : totalScore,
        coinsEarned: effectiveCoins,
        // Snapshotted onto the post like the cosmetics below it, and for
        // the same reason: the leaderboard and the feed draw their avatars
        // from feedPosts, not from public/summary, so without this the
        // fire would be invisible on exactly the two screens where you
        // look at other people.
        currentStreak,
        // So an old post still draws them at the tier they were.
        minStage: userData.role === 'trainer' ? 2 : 1,
        equippedDance: userData.equippedDance ?? null,
        // Legacy single-slot field, still written so anything not yet
        // reading the array keeps working.
        equippedAccessory: userData.equippedAccessory ?? null,
        // The multi-slot loadout (head/eyes/neck) the avatar actually
        // renders from — see src/components/evolution/JimmyAvatar.jsx.
        // Falls back to the legacy field so an account that hasn't
        // re-equipped since the migration still shows its accessory on the
        // feed and leaderboard.
        equippedAccessories: Array.isArray(userData.equippedAccessories)
          ? userData.equippedAccessories
          : userData.equippedAccessory
            ? [userData.equippedAccessory]
            : [],
        // Same treatment as the profile list above: a bodyweight PR goes
        // out as BW + belt, never as the absolute load.
        personalRecords:
          sharePersonalRecords === true
            ? personalRecords.map((r) => publishableRecord(r.exerciseId, r))
            : [],
        timestamp: finishedAtIso,
      });
    }
  });

  return {
    workoutId: workoutRef.id,
    coinsEarned: effectiveCoins,
    personalRecords: effectiveRecords,
    recoveryWorkout: isRecovery,
    // Only meaningful when recoveryWorkout is true: whether THIS one
    // actually cleared RECOVERY_MIN_SCORE and lifted the neglect penalty,
    // vs. staying "overdue" because it was too light to count. Always true
    // for a normal (non-recovery) workout.
    neglectPenaltyLifted,
    // Badge ids unlocked by THIS workout (empty for a recovery log). The
    // full set lives on users/{uid}.badges; this is just what to celebrate.
    newBadges,
    // { itemId, name, emoji } exactly once, ever, per account — the
    // Silver Lootbox's first-workout dance grant. null every other time.
    firstWorkoutReward,
    // The run this workout just extended. The account doc carries it live
    // anyway, so nothing NEEDS this — it is here so the summary screen can
    // say "3 in a row 🔥" without waiting for the snapshot to land.
    currentStreak,
    // Raw kg moved in THIS session, for the summary screen's volume bar.
    // Returned rather than re-summed on the client, because the client's
    // own set.weight is blank for a bodyweight exercise — the lifter's
    // body weight is folded in here, server-side. A client-side sum would
    // report a full pull-up session as 0 kg.
    totalVolumeKg,
  };
});

// Callable from the client via httpsCallable(functions, 'purchaseItem').
// Price and ownership are both re-checked against server state inside a
// transaction — a client sending a stale/forged cost is simply ignored,
// only `storeCatalog.js`'s price is ever charged.
exports.purchaseItem = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const item = STORE_ITEMS_BY_ID.get(request.data?.itemId);
  if (!item) throw new HttpsError('invalid-argument', 'Unknown item.');

  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);
  const field = item.type === 'dance' ? 'unlockedDances' : 'unlockedAccessories';

  const newBalance = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpsError('failed-precondition', "Your profile doc doesn't exist yet — try again in a moment.");

    const data = snap.data();
    const coins = Number(data.coins) || 0;
    const owned = Array.isArray(data[field]) ? data[field] : [];
    if (owned.includes(item.id)) {
      throw new HttpsError('already-exists', `You already own ${item.name}.`);
    }
    if (coins < item.cost) {
      throw new HttpsError('failed-precondition', `Not enough coins — ${item.name} costs ${item.cost}, you have ${coins}.`);
    }

    const updated = coins - item.cost;
    tx.update(userRef, { coins: updated, [field]: FieldValue.arrayUnion(item.id) });

    // Buying a dance updates the friend-visible showcase immediately
    // rather than at the buyer's next logged workout — the same
    // "cosmetics should land the moment you change them" reasoning behind
    // equipItem's client-side mirror (hooks/useEconomy.js), except this
    // one has to be server-side: unlockedDances is not a field the rules
    // let a client write to public/summary, precisely so an unpaid-for
    // dance can never appear there. merge:true rather than update()
    // because set() is what tolerates a missing doc; in practice there
    // is never one to create, since accounts start at 0 coins (see
    // firestore.rules' serverManagedFieldsAtDefault) and coins only come
    // from logWorkout, which writes the summary first.
    if (item.type === 'dance') {
      tx.set(
        userRef.collection('public').doc('summary'),
        { unlockedDances: FieldValue.arrayUnion(item.id) },
        { merge: true },
      );
    }
    return updated;
  });

  return { newBalance, unlocked: item.id };
});
