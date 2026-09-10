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
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const {
  MIN_WEIGHT_KG,
  MAX_WEIGHT_KG,
  MIN_REPS,
  MAX_REPS,
  MAX_SETS_PER_WORKOUT,
  WINDOW_MS,
  MIN_GAP_MS,
  MAX_WORKOUTS_PER_WINDOW,
  COINS_PER_VOLUME_KG,
  MAX_COINS_PER_WORKOUT,
  STORE_ITEMS_BY_ID,
} = require('./storeCatalog');

// Re-validates and re-computes every set server-side — the client's own
// clamped inputs (see SetRow.jsx) are a UX nicety, not a security boundary.
// Throws HttpsError('invalid-argument', ...) the instant anything is out of
// bounds; the whole workout is rejected rather than silently dropping the
// bad set, so nothing gets partial credit for a tampered payload.
function validateAndScoreWorkout(exercises) {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    throw new HttpsError('invalid-argument', 'A workout needs at least one exercise.');
  }

  let totalVolume = 0;
  let totalSets = 0;
  const cleanExercises = [];

  for (const exercise of exercises) {
    if (!exercise || typeof exercise.exerciseId !== 'string' || !Array.isArray(exercise.sets)) {
      throw new HttpsError('invalid-argument', 'Malformed exercise entry.');
    }

    const cleanSets = [];
    for (const rawSet of exercise.sets) {
      // Sets left un-checked in the UI (weight/reps typed but never marked
      // complete) don't count toward the workout at all — same as today.
      if (!rawSet?.completed) continue;

      totalSets += 1;
      if (totalSets > MAX_SETS_PER_WORKOUT) {
        throw new HttpsError('invalid-argument', `A single workout can't log more than ${MAX_SETS_PER_WORKOUT} sets.`);
      }

      const weight = Number(rawSet.weight);
      const reps = Number(rawSet.reps);
      if (!Number.isFinite(weight) || weight < MIN_WEIGHT_KG || weight > MAX_WEIGHT_KG) {
        throw new HttpsError('invalid-argument', `Weight must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg — got ${rawSet.weight}.`);
      }
      if (!Number.isInteger(reps) || reps < MIN_REPS || reps > MAX_REPS) {
        throw new HttpsError('invalid-argument', `Reps must be a whole number between ${MIN_REPS} and ${MAX_REPS} — got ${rawSet.reps}.`);
      }

      totalVolume += weight * reps;
      // A missing id crashes the write below with a 500 (the Admin SDK
      // rejects `undefined` outright — found live during a security audit,
      // via a call that omitted it) — the real app's client always sends
      // one, but this is the actual validation boundary, so it has to cope
      // with a call that doesn't.
      cleanSets.push({
        id: typeof rawSet.id === 'string' ? rawSet.id : randomUUID(),
        weight,
        reps,
        completed: true,
      });
    }

    if (cleanSets.length === 0) continue; // an exercise with nothing completed just doesn't count

    cleanExercises.push({
      exerciseId: exercise.exerciseId,
      name: typeof exercise.name === 'string' ? exercise.name.slice(0, 200) : exercise.exerciseId,
      muscleGroup: typeof exercise.muscleGroup === 'string' ? exercise.muscleGroup.slice(0, 60) : null,
      sets: cleanSets,
    });
  }

  if (cleanExercises.length === 0) {
    throw new HttpsError('invalid-argument', 'Log at least one completed set to finish a workout.');
  }

  const coinsEarned = Math.min(MAX_COINS_PER_WORKOUT, Math.floor(totalVolume * COINS_PER_VOLUME_KG));
  return { cleanExercises, totalVolume, coinsEarned };
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

  const { cleanExercises, totalVolume, coinsEarned } = validateAndScoreWorkout(exercises);

  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);
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

    const currentCoins = Number(userSnap.data().coins) || 0;
    const finishedAtIso = new Date(now).toISOString();

    tx.set(workoutRef, {
      exercises: cleanExercises,
      startedAt: typeof startedAt === 'string' ? startedAt : finishedAtIso,
      finishedAt: finishedAtIso,
      assignedWorkoutId: typeof assignedWorkoutId === 'string' ? assignedWorkoutId : null,
      // Marks this doc as having come through server validation + reward —
      // see firestore.rules for why a directly client-written workout
      // (still possible for personal history edits) can never carry this.
      verified: true,
      coinsEarned,
    });
    tx.set(
      economyRef,
      // .slice(-MAX_WORKOUTS_PER_WINDOW): `recent` is already filtered to
      // the live window and gated at < MAX_WORKOUTS_PER_WINDOW above, so
      // this never actually trims anything today — it is a deliberate
      // second line of defense that keeps the array from growing without
      // bound if this constant is ever raised later without a migration.
      { recentWorkoutLogs: [...recent, now].slice(-MAX_WORKOUTS_PER_WINDOW).map((ms) => new Date(ms).toISOString()) },
      { merge: true },
    );
    tx.update(userRef, { coins: FieldValue.increment(coinsEarned) });

    // The social feed post — see firestore.rules' feedPosts match. Cosmetics
    // are snapshotted as of THIS workout rather than read live later, so a
    // friend's feed card shows what you were wearing when you actually did
    // it (and never needs read access to your full, otherwise-private
    // profile doc to display them).
    const userData = userSnap.data();
    tx.set(feedPostRef, {
      userId: uid,
      userName: userData.displayName ?? 'Someone',
      headline: headline(cleanExercises),
      exerciseCount: cleanExercises.length,
      totalSets: cleanExercises.reduce((sum, e) => sum + e.sets.length, 0),
      totalVolume: Math.round(totalVolume),
      coinsEarned,
      equippedDance: userData.equippedDance ?? null,
      equippedAccessory: userData.equippedAccessory ?? null,
      // Every logged workout already produces a feed post, so this flag is
      // not "post or don't" — it is whether the records get called out on
      // the post that is going out either way.
      personalRecords: sharePersonalRecords === true ? personalRecords : [],
      timestamp: finishedAtIso,
    });

    // Refresh the friend-visible profile summary — see publicProfile.js.
    // `sharePersonalRecords` above is a one-off, per-post consent ("call
    // out this workout's PR in the feed"); `userData.sharePRs` is the
    // standing profile-level consent ("let friends see my current
    // all-time bests at all"). They are deliberately independent: someone
    // can announce a single PR on their feed without ever turning on the
    // persistent profile list, and vice versa.
    const allWorkouts = [...pastWorkoutsSnap.docs.map((d) => d.data()), { exercises: cleanExercises }];
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
  });

  return { workoutId: workoutRef.id, coinsEarned, personalRecords };
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
