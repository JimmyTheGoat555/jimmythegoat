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
const { findNewPersonalRecords, bestWeightPerExercise, lifetimeVolumeOf } = require('./records');
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
  WINDOW_MS,
  MIN_GAP_MS,
  MAX_WORKOUTS_PER_WINDOW,
  NEGLECT_RECOVERY_MS,
  COINS_PER_RELATIVE_POINT,
  MAX_COINS_PER_WORKOUT,
  STORE_ITEMS_BY_ID,
} = require('./storeCatalog');
const { BODYWEIGHT_EXERCISE_IDS } = require('./exercises');

const round1 = (n) => Math.round(Number(n) * 10) / 10;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

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
        ...(isBodyweight ? { isBodyweight: true, addedWeight, bodyWeightAtLog: round1(bw) } : {}),
      });
    }

    if (cleanSets.length === 0) continue; // an exercise with nothing completed just doesn't count

    cleanExercises.push({
      exerciseId: exercise.exerciseId,
      name: exName,
      muscleGroup: typeof exercise.muscleGroup === 'string' ? exercise.muscleGroup.slice(0, 60) : null,
      sets: cleanSets,
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

  // Personal records are recomputed here from stored history rather than
  // trusted from the client, which only used its own copy to decide whether
  // to offer the share. Read outside the transaction: it is a whole-history
  // scan, and the per-user cooldown a few lines down means the same account
  // cannot be logging two workouts concurrently for it to race with.
  //
  // Scale note: this reads every workout the user has ever logged, on every
  // log. Fine at this app's size (same judgement as weeklyWeighInReminders
  // in index.js); if that stops being true, keep a running best-per-exercise
  // doc under users/{uid}/meta and update it here instead.
  const pastWorkoutsSnap = await userRef.collection('workouts').get();
  const personalRecords = findNewPersonalRecords(
    cleanExercises,
    pastWorkoutsSnap.docs.map((d) => d.data()),
  );

  const now = Date.now();

  // Set inside the transaction (they depend on the authoritative
  // economy-doc read there), used again in the return below — hoisted so
  // both scopes can see them.
  let isRecovery = false;
  let effectiveCoins = coinsEarned;
  let effectiveRecords = personalRecords;
  let newBadges = [];

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
    // the last logged workout, THIS one is a recovery workout. It still
    // gets written to history and still refreshes `lastWorkoutAt` (which
    // is what lifts the client-side 1-tier penalty — see
    // src/utils/evolutionTiers.js), but it earns no coins, adds nothing to
    // lifetime volume, sets no PRs, and doesn't post to the feed. A
    // second, normal workout is then needed to actually progress again.
    // Requires a PRIOR workout: a brand-new account's very first workout
    // (no lastWorkoutAt) is never a "recovery".
    const lastWorkoutMs = Date.parse(economy.lastWorkoutAt);
    isRecovery = Number.isFinite(lastWorkoutMs) && now - lastWorkoutMs >= NEGLECT_RECOVERY_MS;
    effectiveCoins = isRecovery ? 0 : coinsEarned;
    effectiveRecords = isRecovery ? [] : personalRecords;

    tx.set(workoutRef, {
      exercises: cleanExercises,
      startedAt: typeof startedAt === 'string' ? startedAt : finishedAtIso,
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
    tx.set(
      economyRef,
      {
        // .slice(-MAX_WORKOUTS_PER_WINDOW): `recent` is already filtered to
        // the live window and gated at < MAX_WORKOUTS_PER_WINDOW above, so
        // this never actually trims anything today — it is a deliberate
        // second line of defense that keeps the array from growing without
        // bound if this constant is ever raised later without a migration.
        recentWorkoutLogs: [...recent, now].slice(-MAX_WORKOUTS_PER_WINDOW).map((ms) => new Date(ms).toISOString()),
        // The authoritative "when did this user last train" — the rolling
        // window above only spans 24h, so it can't answer the 5-day
        // neglect question. Written on EVERY log, recovery or not.
        lastWorkoutAt: finishedAtIso,
      },
      { merge: true },
    );
    if (effectiveCoins > 0) {
      tx.update(userRef, { coins: FieldValue.increment(effectiveCoins) });
    }

    // Mirror of economyRef.lastWorkoutAt onto the user doc itself, written
    // on EVERY log (recovery included). The economy-doc copy is read by
    // this same function for the recovery check; this copy exists so the
    // daily re-engagement job (functions/index.js's teaseLazyGoats) can
    // find idle users with one indexed range query on `users` instead of
    // fetching every user's meta/economy subdoc. Server-only — see
    // firestore.rules' serverManagedFieldsUnchanged().
    tx.set(userRef, { lastWorkoutAt: finishedAtIso }, { merge: true });

    const userData = userSnap.data();

    // Refresh the friend-visible profile summary — see publicProfile.js.
    // `sharePersonalRecords` below is a one-off, per-post consent ("call
    // out this workout's PR in the feed"); `userData.sharePRs` is the
    // standing profile-level consent ("let friends see my current
    // all-time bests at all"). They are deliberately independent.
    //
    // The in-progress workout is appended carrying its recoveryWorkout
    // flag so lifetimeVolumeOf / bestWeightPerExercise skip it exactly as
    // they skip past recovery workouts — a recovery log must not move the
    // friend-visible tier either.
    const allWorkouts = [
      ...pastWorkoutsSnap.docs.map((d) => d.data()),
      // `finishedAt` + `score` mirror what the workout doc gets written
      // with above, so badge evaluation (workout count, streak) and
      // lifetimeVolumeOf both see this session as a real, dated entry.
      { exercises: cleanExercises, finishedAt: finishedAtIso, score: isRecovery ? 0 : totalScore, recoveryWorkout: isRecovery },
    ];
    const summary = {
      displayName: userData.displayName ?? 'Someone',
      lifetimeVolume: Math.round(lifetimeVolumeOf(allWorkouts)),
      sharePRs: userData.sharePRs === true,
    };
    if (userData.sharePRs === true) {
      summary.personalRecords = [...bestWeightPerExercise(allWorkouts).entries()].map(([exerciseId, r]) => ({
        exerciseId,
        name: r.name,
        weight: r.weight,
        reps: r.reps,
      }));
    }
    tx.set(userRef.collection('public').doc('summary'), summary, { merge: true });

    // Achievement badges (see functions/badges.js + src/data/badges.js).
    // Re-derived from the full history every log — never trusted from the
    // client — and only ever ADDED (arrayUnion), so a badge earned once
    // stays earned. A recovery workout awards nothing, same as coins/PRs.
    const heldBadgeIds = new Set(
      (Array.isArray(userData.badges) ? userData.badges : []).map((b) => (typeof b === 'string' ? b : b?.id)),
    );
    newBadges = isRecovery
      ? []
      : [...evaluateBadges(allWorkouts)].filter((id) => !heldBadgeIds.has(id));
    if (newBadges.length > 0) {
      tx.update(userRef, {
        badges: FieldValue.arrayUnion(...newBadges.map((id) => ({ id, at: finishedAtIso }))),
      });
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
        // Relative Strength Volume for this workout — what the weekly
        // leaderboard now ranks on, so a lighter lifter isn't buried by a
        // heavier friend's raw tonnage. Written with the same
        // `isRecovery ? 0 : totalScore` shape as the workout doc; a
        // recovery workout never reaches this branch (no feed post) but
        // the guard is kept explicit so the two writes can't drift.
        score: isRecovery ? 0 : totalScore,
        coinsEarned: effectiveCoins,
        equippedDance: userData.equippedDance ?? null,
        equippedAccessory: userData.equippedAccessory ?? null,
        personalRecords: sharePersonalRecords === true ? personalRecords : [],
        timestamp: finishedAtIso,
      });
    }
  });

  return {
    workoutId: workoutRef.id,
    coinsEarned: effectiveCoins,
    personalRecords: effectiveRecords,
    recoveryWorkout: isRecovery,
    // Badge ids unlocked by THIS workout (empty for a recovery log). The
    // full set lives on users/{uid}.badges; this is just what to celebrate.
    newBadges,
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
    return updated;
  });

  return { newBalance, unlocked: item.id };
});
