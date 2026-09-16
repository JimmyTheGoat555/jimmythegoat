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
const logger = require('firebase-functions/logger');
const { isAppAdminUid } = require('./appAdmin');
const { resolveMascotId } = require('./mascots');
const { EVOLUTION_TIERS, evolutionCrossed } = require('./evolution');
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
  WORKOUT_COOLDOWN_MS,
  LOG_HISTORY_MS,
  MAX_LOG_HISTORY,
  NEGLECT_RECOVERY_MS,
  RECOVERY_MIN_SCORE,
  COINS_PER_RELATIVE_POINT,
  MAX_COINS_PER_WORKOUT,
  RECOMMENDATION_BOUNTY_COINS,
  REST_BOOST_MULTIPLIER,
  STORE_ITEMS_BY_ID,
  STARTER_DANCE_ID,
} = require('./storeCatalog');
const { livePendingBoosts, BOOST_TOKEN_RE } = require('./restBoost');
const {
  BODYWEIGHT_EXERCISE_IDS,
  DUMBBELL_EXERCISE_IDS,
  BARBELL_EXERCISE_IDS,
  ALLOWED_BAR_WEIGHTS,
} = require('./exercises');

const round1 = (n) => Math.round(Number(n) * 10) / 10;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

const DAY_MS = 24 * 60 * 60 * 1000;

// How many friends hear about an evolution. See the fan-out at the bottom
// of logWorkout for why this is a ceiling and not just a batch size: the
// official account is friends with every user in the app, so an uncapped
// fan-out from that account is a push notification to the entire user base.
const MAX_EVOLUTION_FANOUT = 50;
// Firestore's hard limit is 500 writes per batch; this leaves room.
const EVOLUTION_BATCH_SIZE = 400;
// The top of the ladder, for the "max evolution" wording. Read off the
// table rather than hard-coded, so adding a fifth tier cannot leave this
// congratulating people for reaching the second-highest one.
const MAX_EVOLUTION_STAGE = EVOLUTION_TIERS.at(-1).stage;
// How long a streak survives between sessions. Three days, so one skipped
// gym day — or a weekend — does not wipe a run. Deliberately forgiving:
// this number exists to make people come back, and a streak that punishes
// a single rest day mostly teaches them the streak is not worth chasing.
const STREAK_GAP_MS = 3 * DAY_MS;

// Ceiling on the "which PRs do I want to share" id list. A workout is
// already capped at far fewer exercises than this by
// validateAndScoreWorkout, so no honest client ever approaches it — it
// exists so a hand-crafted payload cannot hand us an unbounded array to
// build a Set from before any of the real validation runs.
const MAX_SHARED_RECORD_IDS = 100;

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
  // [{ index, tokenId }] — which cleanExercises entry names which
  // rest-timer boost token. Shape-checked here; whether a token is REAL is
  // decided inside logWorkout's transaction against meta/economy, because
  // that is where the answer lives (functions/restBoost.js).
  const boostClaims = [];
  const claimedTokens = new Set();

  for (const exercise of exercises) {
    if (!exercise || typeof exercise.exerciseId !== 'string' || !Array.isArray(exercise.sets)) {
      throw new HttpsError('invalid-argument', 'Malformed exercise entry.');
    }

    // Trusted from the server's own list, never the client payload.
    const isBodyweight = BODYWEIGHT_EXERCISE_IDS.has(exercise.exerciseId);
    const exName = typeof exercise.name === 'string' ? exercise.name.slice(0, 200) : exercise.exerciseId;

    // The same token on two exercises is rejected outright rather than
    // honoured once. It is not a shape an honest client produces (the app
    // pins each token to exactly one exercise — useWorkouts' bindRestBoost),
    // so it is a tampered payload, and a tampered payload gets no partial
    // credit — the rule every other check in this function follows.
    const boostTokenId = exercise.boostTokenId;
    if (boostTokenId != null) {
      if (typeof boostTokenId !== 'string' || !BOOST_TOKEN_RE.test(boostTokenId)) {
        throw new HttpsError('invalid-argument', 'Malformed boost token.');
      }
      if (claimedTokens.has(boostTokenId)) {
        throw new HttpsError('invalid-argument', 'One boost cannot cover two exercises.');
      }
      claimedTokens.add(boostTokenId);
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
        //
        // When the set carries the input sheet's context fields, the
        // absolute weight is RECOMPUTED from them rather than taken from
        // `rawSet.weight`. Not a security measure — a payload that wants a
        // bigger number just omits the context, and the range check below
        // is what actually bounds that — but a consistency one: the stored
        // `weight` can then never disagree with the barWeight/perSide it
        // is stored next to, which is exactly the contradiction that would
        // make a re-opened set silently change its own total.
        effectiveWeight = round1(deriveWeight(rawSet, exercise.exerciseId));
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
        // How the lifter reached that weight — the bar and plates, or the
        // number on the dumbbell. Display/edit context only; nothing
        // scores off it. See loadContextFor and src/utils/setLoad.js.
        ...(isBodyweight ? {} : loadContextFor(rawSet, exercise.exerciseId, effectiveWeight)),
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
    // Recorded against the entry just pushed. An exercise with nothing
    // completed never reaches here, so a token pinned to one is simply not
    // claimed — it stays pending for the next session inside its TTL.
    if (boostTokenId != null) boostClaims.push({ index: cleanExercises.length - 1, tokenId: boostTokenId });
  }

  if (cleanExercises.length === 0) {
    throw new HttpsError('invalid-argument', 'Log at least one completed set to finish a workout.');
  }

  totalScore = round2(totalScore);
  return { cleanExercises, totalScore, totalVolumeKg: Math.round(totalVolumeKg), boostClaims };
}

// The coin payout for a validated workout.
//
// Split out of validateAndScoreWorkout because it has one input that
// function cannot have: which exercises carry a REDEEMED rest-timer boost,
// known only inside logWorkout's transaction once meta/economy has been
// read. With no boosts this is exactly the formula that used to sit at the
// end of that function — every set's relativeVolume, summed, rounded,
// times COINS_PER_RELATIVE_POINT, capped — so an unboosted workout pays
// what it always paid.
//
// The multiplier is applied to the boosted exercise's SETS on the way into
// the sum, not to a second copy of the score, so the cap still binds the
// total. And it is applied HERE and nowhere else: `totalScore`, the number
// that feeds lifetime volume, tiers, records and the feed, is untouched by
// a boost. An ad doubles coins; it never doubles what somebody lifted.
function coinsFor(cleanExercises, boostedIndexes) {
  let points = 0;
  cleanExercises.forEach((exercise, i) => {
    const multiplier = boostedIndexes.has(i) ? REST_BOOST_MULTIPLIER : 1;
    for (const set of exercise.sets) points += set.relativeVolume * multiplier;
  });
  return Math.min(MAX_COINS_PER_WORKOUT, Math.round(round2(points) * COINS_PER_RELATIVE_POINT));
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
// The absolute load for a weighted set: bar + both sides for a barbell,
// both dumbbells for a dumbbell, the stack for anything else.
//
// Falls back to the client's own `weight` whenever the context is absent
// or nonsense, which covers every set logged before the calculator existed
// and every custom exercise that has no equipment at all.
function deriveWeight(rawSet, exerciseId) {
  if (BARBELL_EXERCISE_IDS.has(exerciseId)) {
    const bar = Number(rawSet.barWeight);
    const side = Number(rawSet.weightPerSide);
    if (ALLOWED_BAR_WEIGHTS.has(bar) && Number.isFinite(side) && side >= 0) {
      return bar + side * 2;
    }
  }
  // EVERY number that reaches here for a dumbbell exercise is per-hand,
  // with or without the marker — that is the app's convention and always
  // has been ("Dumbbell entries are PER DUMBBELL, the way a rack is
  // labelled", src/data/exercises.js). A set the new sheet wrote says so
  // explicitly; one seeded from history and checked off without ever
  // opening the sheet does not, and a client that has not reloaded since
  // this shipped never will. All three mean 25 kg in each hand.
  //
  // So the doubling happens here, at the one boundary every new set
  // crosses, rather than in the input sheet — otherwise whether a set
  // counted 25 kg or 50 kg would depend on whether its owner happened to
  // tap it, and a single workout could contain both.
  //
  // This applies ONLY to sets being logged now. Workout documents already
  // in Firestore are never re-sent through here, so no past session, chart
  // or lifetime total moves.
  if (DUMBBELL_EXERCISE_IDS.has(exerciseId)) {
    const perHand = rawSet.isPerHand === true ? Number(rawSet.perHandWeight) : Number(rawSet.weight);
    if (Number.isFinite(perHand) && perHand > 0) return perHand * 2;
  }
  return rawSet.weight;
}

// The context fields, rebuilt from scratch like every other field on a
// stored set — anything not named here is dropped silently, so this is
// what makes the input sheet able to reconstruct itself on a later edit.
// Re-derived rather than copied: they are stored only when they actually
// agree with the weight above.
function loadContextFor(rawSet, exerciseId, effectiveWeight) {
  if (BARBELL_EXERCISE_IDS.has(exerciseId)) {
    const bar = Number(rawSet.barWeight);
    const side = Number(rawSet.weightPerSide);
    if (ALLOWED_BAR_WEIGHTS.has(bar) && Number.isFinite(side) && side >= 0
        && round1(bar + side * 2) === effectiveWeight) {
      // round2, not round1: a side can legitimately be 21.25 (one 20 and
      // one 1.25), and rounding that to 21.3 would store a bar that no
      // longer adds up to its own total — the set would then re-open
      // showing a different weight than it was logged with.
      return { barWeight: round1(bar), weightPerSide: round2(side) };
    }
  }
  // Stamped on every dumbbell set, however it arrived — it is the marker
  // that tells a later reader `weight` is the pair rather than one
  // dumbbell, so a set that lacks it is indistinguishable from the old
  // format. Derived from the weight actually stored, so the two can never
  // disagree.
  if (DUMBBELL_EXERCISE_IDS.has(exerciseId)) {
    return { isPerHand: true, perHandWeight: round2(effectiveWeight / 2) };
  }
  return {};
}

// Marker for the one-time dumbbell rebasing below. A field on the records
// doc rather than a separate migration script: it runs inside the call
// that needs it, exactly once, for accounts that actually train again.
const DUMBBELL_RECORDS_VERSION = 2;

// A 25 kg dumbbell in each hand is 50 kg of load, and new sets store it
// that way (see src/utils/setLoad.js). Every dumbbell best recorded before
// that stores 25 — the number on the rack — so without this the very next
// dumbbell session would "break" every one of those records with the exact
// same weight the lifter used last week, and the feed would announce it.
//
// So the stored bests are rebased once, in memory, on the first log after
// this shipped; the doubled figure is then written back by the normal
// applyWorkoutToRecords path along with the version marker, and this
// becomes a no-op forever after.
//
// Deliberately NOT applied to lifetimeVolume or the workout history. Those
// are an accumulated total and a log of what happened, and silently
// rewriting either would move every past chart and tier. Only the PR
// comparison needs to be on one scale with the new data — it is the only
// place old and new numbers are compared against each other.
function normalizeDumbbellRecords(records) {
  if (!records || records.dumbbellRecordsVersion >= DUMBBELL_RECORDS_VERSION) return records;
  const bestPerExercise = { ...(records.bestPerExercise ?? {}) };
  for (const [exerciseId, best] of Object.entries(bestPerExercise)) {
    if (!DUMBBELL_EXERCISE_IDS.has(exerciseId)) continue;
    const weight = Number(best?.weight);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    bestPerExercise[exerciseId] = { ...best, weight: round1(weight * 2) };
  }
  return { ...records, bestPerExercise, dumbbellRecordsVersion: DUMBBELL_RECORDS_VERSION };
}

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
  const {
    exercises,
    assignedWorkoutId,
    templateId,
    startedAt,
    sharePersonalRecords,
    sharedRecordExerciseIds,
  } = request.data ?? {};

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

  const { cleanExercises, totalScore, totalVolumeKg, boostClaims } = validateAndScoreWorkout(
    exercises,
    bodyWeightKg,
  );

  const economyRef = userRef.collection('meta').doc('economy');
  const workoutRef = userRef.collection('workouts').doc();
  // Was this session built from a routine a friend recommended? The client
  // sends only the TEMPLATE id — never the friend's uid — and this
  // document decides both whether a bounty is owed and who receives it.
  // It is written exclusively by acceptRecommendation on the Admin SDK
  // (firestore.rules: no client write path), which is what makes "the
  // sender" a server-established fact rather than a request field. A
  // client naming a template it invented finds nothing here and is paid
  // nothing; it cannot name a beneficiary at all.
  const recommendedByRef =
    typeof templateId === 'string' && templateId ? userRef.collection('recommendedBy').doc(templateId) : null;
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
  // Resolved here, outside the transaction, for the cooldown branch below.
  // One cached Auth lookup per cold instance (functions/appAdmin.js), and
  // false for every account but one — including if the lookup fails, which
  // is the direction a bypass has to fail in.
  const isAdmin = await isAppAdminUid(uid);

  const recordsRef = userRef.collection('meta').doc('records');
  const recordsSnap = await recordsRef.get();
  const records = normalizeDumbbellRecords(
    recordsSnap.exists
      ? recordsSnap.data()
      : buildRecordsSnapshot((await userRef.collection('workouts').get()).docs.map((d) => d.data())),
  );

  const personalRecords = findNewPersonalRecordsFromBest(cleanExercises, records.bestPerExercise);

  // Which of those the lifter chose to announce on the feed post.
  //
  // The client sends ids ONLY, and they are used purely as a membership
  // test against the list the SERVER just computed — so this can hide a
  // record, never invent one. A payload naming a lift that wasn't a PR
  // (or wasn't in this workout at all) matches nothing and changes
  // nothing; the feed post still can't claim a record that didn't happen.
  //
  // Two shapes are accepted on purpose. `sharedRecordExerciseIds` is the
  // per-record choice (WorkoutSummaryModal's checkboxes), and an EMPTY
  // array is a real answer meaning "none of them" — which is why the
  // Array.isArray check, not a truthiness one, decides whether it applies.
  // Falling back to the old `sharePersonalRecords` boolean keeps two
  // things working that would otherwise silently start publishing the
  // wrong thing: a finish that was queued offline by a previous build
  // (App.jsx replays the exact payload it saved), and any client that
  // hasn't reloaded since this shipped.
  const selectedRecords = (() => {
    if (Array.isArray(sharedRecordExerciseIds)) {
      // Bounded before it becomes a Set — the array is attacker-controlled
      // and nothing downstream reads its length.
      const chosen = new Set(sharedRecordExerciseIds.slice(0, MAX_SHARED_RECORD_IDS).filter((id) => typeof id === 'string'));
      return personalRecords.filter((r) => chosen.has(r.exerciseId));
    }
    return sharePersonalRecords === true ? personalRecords : [];
  })();

  const now = Date.now();

  // Set inside the transaction (they depend on the authoritative
  // economy-doc read there), used again in the return below — hoisted so
  // both scopes can see them.
  let isRecovery = false;
  let neglectPenaltyLifted = true;
  // Coins are settled INSIDE the transaction now (see coinsFor): the
  // rest-timer boosts that can change them are read off meta/economy
  // there, and nowhere earlier is that read authoritative.
  let effectiveCoins = 0;
  // [{ exerciseId, name, multiplier }] for each boost this workout
  // actually redeemed — what the celebration names. Empty nearly always.
  let coinBoosts = [];
  let effectiveRecords = personalRecords;
  let newBadges = [];
  let firstWorkoutReward = null;
  let currentStreak = 0;
  // How long the session actually ran, from the SANITIZED start (see
  // sanitizeStartedAt — a workout resumed days later is clamped, which is
  // exactly the case where a client-side "now minus startedAt" would put
  // "72h 14m" on the celebration screen while the history entry said zero).
  // Returned so the one number on screen is the one in the document.
  let durationMs = 0;
  // { senderUid, senderName } once a bounty has actually been paid, so the
  // finisher's summary screen can say who it went to. null otherwise.
  let recommendationBounty = null;
  // { from, to } when this workout crossed an evolution threshold, else
  // null. Set inside the transaction (where both sides of the comparison
  // are consistent) and acted on after it commits — see the fan-out below.
  let evolution = null;
  let evolvedName = 'A friend';
  let evolvedFriends = [];

  await db.runTransaction(async (tx) => {
    const [userSnap, economySnap] = await Promise.all([tx.get(userRef), tx.get(economyRef)]);
    if (!userSnap.exists) throw new HttpsError('failed-precondition', "Your profile doc doesn't exist yet — try again in a moment.");

    // Every read in a Firestore transaction has to happen before the first
    // write, so the bounty lookup is resolved here even though the payout
    // is written at the very bottom — it depends on `isRecovery`, which is
    // not known yet. Two chained reads (the provenance doc, then the
    // sender's own doc) rather than one, because the second is addressed
    // by a uid the first supplies.
    let bountyTarget = null;
    if (recommendedByRef) {
      const provenanceSnap = await tx.get(recommendedByRef);
      const provenance = provenanceSnap.exists ? provenanceSnap.data() : null;
      const senderUid = typeof provenance?.senderUid === 'string' ? provenance.senderUid : null;
      // `bountyPaidAt` already set = this recommendation has been cashed.
      // Doing the same routine every week is the feature working, not
      // fifty coins a week for the friend who sent it once.
      if (senderUid && senderUid !== uid && !provenance.bountyPaidAt) {
        const senderRef = db.collection('users').doc(senderUid);
        const senderSnap = await tx.get(senderRef);
        // A deleted account is not paid, and — more to the point — is not
        // resurrected: a bare increment would create a ghost users/{uid}
        // doc holding nothing but a coin balance.
        if (senderSnap.exists) {
          bountyTarget = { ref: senderRef, uid: senderUid, name: provenance.senderName ?? 'A friend' };
        }
      }
    }

    // A short trail of recent log times, kept sorted oldest-first — the
    // same order they are written back in below. Only the newest one is
    // load-bearing (the cooldown is measured from it); the rest are
    // history, pruned to LOG_HISTORY_MS.
    const economy = economySnap.exists ? economySnap.data() : {};
    const stored = Array.isArray(economy.recentWorkoutLogs) ? economy.recentWorkoutLogs : [];
    const recent = stored
      .map((iso) => Date.parse(iso))
      .filter((ms) => Number.isFinite(ms) && now - ms < LOG_HISTORY_MS)
      .sort((a, b) => a - b);

    // The one rule. Still enforced here even though the Workout tab now
    // refuses to START a session during a cooldown (useWorkoutCooldown):
    // that lock is a courtesy so nobody loses a logged session to a
    // rejection, and a courtesy is not a boundary — this is.
    //
    // ADMIN BYPASS: four hours between logs makes testing the finish flow
    // a four-hour job. `isAdmin` is resolved ONCE before this transaction
    // opens (see above) — an Auth lookup inside a transaction body would
    // be re-run on every retry, which is exactly the non-Firestore async
    // work a transaction must not contain.
    //
    // Note what this does NOT skip: the workout still scores normally and
    // still pays normally. Bypassing the cooldown means the admin account
    // can mint coins at will — stated plainly because it is a real
    // consequence, not a footnote, and it is why this branch is one
    // greppable line rather than a scattering of conditions.
    if (!isAdmin && recent.length > 0) {
      const sinceLast = now - recent[recent.length - 1];
      if (sinceLast < WORKOUT_COOLDOWN_MS) {
        throw new HttpsError(
          'resource-exhausted',
          `Take a breather — you can log another workout in ${formatWait(WORKOUT_COOLDOWN_MS - sinceLast)}.`,
        );
      }
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
    effectiveRecords = isRecovery ? [] : personalRecords;

    // ── Rest-timer boosts ───────────────────────────────────────────────
    //
    // Each exercise may name one token (shape-checked in
    // validateAndScoreWorkout). It counts only if it is on THIS document's
    // pending list right now — the list no client can write — and it is
    // removed from that list in this same transaction, so a retried call
    // cannot apply it twice and a later workout cannot reuse it. A token
    // the payload names that is not here (forged, expired, already spent)
    // is ignored rather than rejected: a boost that ran out mid-session
    // must not cost anyone their workout, and the response says exactly
    // which ones applied, so the client never has to guess.
    //
    // A recovery workout redeems nothing. It pays nothing, so there is
    // nothing to double — and burning the token would charge an ad for a
    // session that earned no coins. It stays pending until it expires.
    const pendingBoosts = livePendingBoosts(economy, now);
    const redeemedTokens = new Set();
    const boostedIndexes = new Set();
    if (!isRecovery) {
      const pendingIds = new Set(pendingBoosts.map((token) => token.id));
      for (const { index, tokenId } of boostClaims) {
        if (!pendingIds.has(tokenId)) continue;
        redeemedTokens.add(tokenId);
        boostedIndexes.add(index);
      }
    }
    coinBoosts = [...boostedIndexes].map((i) => ({
      exerciseId: cleanExercises[i].exerciseId,
      name: cleanExercises[i].name,
      multiplier: REST_BOOST_MULTIPLIER,
    }));
    effectiveCoins = isRecovery ? 0 : coinsFor(cleanExercises, boostedIndexes);

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

    const safeStartedAt = sanitizeStartedAt(startedAt, finishedAtIso, now);
    durationMs = Math.max(0, now - Date.parse(safeStartedAt));

    tx.set(workoutRef, {
      // `coinBoost` marks the exercise a redeemed rest-timer boost was
      // applied to, and only that one — so the history entry can say why
      // this session paid what it did. Written only when true, like
      // isDropSet on a set, so an ordinary exercise's document does not
      // grow a field on every row forever. Display only: nothing that
      // re-sums a workout reads it.
      exercises: cleanExercises.map((exercise, i) =>
        boostedIndexes.has(i) ? { ...exercise, coinBoost: REST_BOOST_MULTIPLIER } : exercise,
      ),
      // Bounded to [now - 48h, now] — see sanitizeStartedAt. Never fed
      // into scoring/coins, only the displayed workout duration.
      startedAt: safeStartedAt,
      finishedAt: finishedAtIso,
      assignedWorkoutId: typeof assignedWorkoutId === 'string' ? assignedWorkoutId : null,
      // Which saved routine this session was loaded from, if any — stored
      // for the same reason assignedWorkoutId is: so the history entry can
      // say where the workout came from without re-deriving it.
      templateId: typeof templateId === 'string' ? templateId : null,
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
      // ── Deferred PR publishing ──────────────────────────────────────
      //
      // The finish flow now asks "which of these do you want to share?"
      // AFTER the celebration has played, which is after this call has
      // already returned (the celebration is built from its response —
      // coins, badges, volume, the record list). So the answer arrives
      // too late to be part of this transaction, and publishWorkoutRecords
      // (functions/publishRecords.js) applies it a few seconds later.
      //
      // These two fields are what let it do that WITHOUT trusting the
      // client: the feed post to amend, and the records the server itself
      // computed. They live on the private workout doc rather than the
      // feed post because a friend can read a feed post, and the whole
      // point of the question is that some of these may never be shared.
      //
      // Safe against tampering because firestore.rules makes a verified
      // workout doc effectively immutable to its owner: any client write
      // is rejected unless the resulting document has `verified` false or
      // absent, and a client can never set it true. So `verified: true`
      // and this list could only have been written together, here.
      feedPostId: feedPostRef.id,
      unpublishedRecords: personalRecords,
    });

    const economyUpdate = {
      // Appended regardless of neglectPenaltyLifted — the cooldown still
      // applies to a below-the-bar recovery attempt. Sliced to a hard
      // bound as well as an age filter: with no per-day cap any more, a
      // determined user can put six entries a day in here, and only the
      // newest matters.
      recentWorkoutLogs: [...recent, now].slice(-MAX_LOG_HISTORY).map((ms) => new Date(ms).toISOString()),
      // The pending boosts minus the ones this workout just spent. Written
      // on EVERY log, not only when something was redeemed, so tokens that
      // expired are pruned by the next session rather than lingering; and
      // written inside this transaction rather than afterwards, which is
      // what makes "consumed" and "paid" the same event.
      restBoosts: pendingBoosts.filter((token) => !redeemedTokens.has(token.id)),
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

    // Did this workout evolve them? Decided HERE, inside the transaction,
    // because it is the only place both sides of the comparison are
    // consistent: `records` is the aggregate as it was read, nextRecords
    // is the same aggregate with this session folded in. Computing it
    // afterwards from a fresh read would race two workouts finishing at
    // once and could announce the same tier twice.
    //
    // The fan-out itself happens AFTER this transaction commits — see
    // below. A friend list is unbounded, and a transaction is the wrong
    // place to write an unbounded number of documents.
    //
    // minStage matches what gets published to `public/summary` a few lines
    // down, so a coach (who is drawn from stage 2 at zero volume) is never
    // announced as having just reached stage 2.
    evolution = evolutionCrossed(records.lifetimeVolume, nextRecords.lifetimeVolume, {
      minStage: userData.role === 'trainer' ? 2 : 1,
    });
    // Captured for the fan-out, which runs without the transaction's
    // snapshot of the user doc.
    evolvedName = userData.displayName ?? 'A friend';
    evolvedFriends = Array.isArray(userData.friends) ? userData.friends : [];

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
      // Which character to draw them as. Published as the DERIVED id, not
      // as `gender` with the deriving left to the reader: the rule lives
      // in one place (functions/mascots.js and its client twin), and a
      // friend's device learns which sprite to load without ever being
      // told anything about the person. Same class of field as minStage
      // above — the narrow published value rather than the raw one it
      // came from.
      mascot: resolveMascotId(userData),
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
        // Snapshotted for exactly the reason the gear and the streak above
        // it are: the leaderboard and the feed build their avatars from
        // feedPosts and never touch anyone's user doc, so a character that
        // is not on the post cannot reach either screen. It also means an
        // old post keeps drawing the mascot they posted as, the same way
        // it keeps their tier — switching in Settings restyles you from
        // the next workout on rather than rewriting your history.
        mascot: resolveMascotId(userData),
        // Same treatment as the profile list above: a bodyweight PR goes
        // out as BW + belt, never as the absolute load. And only the
        // records the lifter actually ticked — see selectedRecords, which
        // can narrow this list but never add to it.
        personalRecords: selectedRecords.map((r) => publishableRecord(r.exerciseId, r)),
        timestamp: finishedAtIso,
      });
    }

    // ── Recommendation bounty ───────────────────────────────────────────
    //
    // The friend who sent this routine is paid the first time it is
    // actually trained. Every part of that is server-side out of
    // necessity rather than habit: the beneficiary comes from a document
    // no client can write, the increment lands in the SAME transaction as
    // the finisher's own reward (so a retried call cannot pay twice), and
    // that transaction also stamps bountyPaidAt (so running the routine
    // again next week cannot pay again).
    //
    // Skipped for a recovery workout, matching every other reward in this
    // function. A session that earns its own lifter nothing must not
    // quietly mint fifty coins for somebody else — otherwise the cheapest
    // possible "workout" becomes a faucet pointed at a chosen account.
    if (bountyTarget && !isRecovery) {
      tx.update(bountyTarget.ref, { coins: FieldValue.increment(RECOMMENDATION_BOUNTY_COINS) });
      tx.update(recommendedByRef, { bountyPaidAt: finishedAtIso });

      const finisherName = userData.displayName ?? 'A friend';
      const bountyText = `${finisherName} completed the workout you sent! You earned ${RECOMMENDATION_BOUNTY_COINS} coins.`;

      // Both documents, mirroring recommendWorkout: the inbox item is the
      // thing they look at, and the plain notification beside it is what
      // turns the moment into a real push — index.js is this app's only
      // FCM caller, and nothing here is worth becoming its second.
      const bountyNotificationRef = bountyTarget.ref.collection('notifications').doc();
      tx.set(bountyNotificationRef, {
        type: 'reward_bounty',
        title: `+${RECOMMENDATION_BOUNTY_COINS} coins 🪙`,
        body: bountyText,
        data: { fromUid: uid, fromName: finisherName },
        read: false,
        createdAt: finishedAtIso,
      });
      tx.set(bountyTarget.ref.collection('inbox').doc(), {
        type: 'reward_bounty',
        message: `Your friend ${bountyText}`,
        amount: RECOMMENDATION_BOUNTY_COINS,
        senderUid: uid,
        senderName: finisherName,
        notificationId: bountyNotificationRef.id,
        createdAt: finishedAtIso,
      });

      recommendationBounty = {
        senderUid: bountyTarget.uid,
        senderName: bountyTarget.name,
        coins: RECOMMENDATION_BOUNTY_COINS,
      };
    }
  });

  // ── "Your friend evolved" ──────────────────────────────────────────────
  //
  // Outside the transaction on purpose. The write above is the one that
  // must not be lost; this is a celebration, and a celebration must never
  // be the reason a logged workout fails. Anything that goes wrong here is
  // logged and swallowed — the lifter still gets their workout, their
  // coins and their own tier-up screen.
  //
  // CAPPED, and the cap is load-bearing rather than defensive. Every
  // account in this app is auto-friended with the official Jimmy account
  // (see officialFriendships.js), so Jimmy's friend list is the entire
  // user base — and sendPushOnNotificationCreate turns every one of these
  // documents into a real phone notification. Without a ceiling, the one
  // account most likely to be used for testing would push the whole app
  // every time it crossed a threshold.
  if (evolution && evolvedFriends.length > 0) {
    try {
      const recipients = evolvedFriends
        .filter((friendUid) => typeof friendUid === 'string' && friendUid !== uid)
        .slice(0, MAX_EVOLUTION_FANOUT);

      // Chunked into batches under Firestore's 500-write limit. One batch
      // covers the default cap comfortably; the loop is here so raising
      // MAX_EVOLUTION_FANOUT later cannot silently start throwing.
      for (let i = 0; i < recipients.length; i += EVOLUTION_BATCH_SIZE) {
        const batch = db.batch();
        for (const friendUid of recipients.slice(i, i + EVOLUTION_BATCH_SIZE)) {
          batch.set(db.collection('users').doc(friendUid).collection('notifications').doc(), {
            type: 'friend_evolved',
            title: `${evolvedName} evolved into ${evolution.to.label} 🎉`,
            body:
              evolution.to.stage === MAX_EVOLUTION_STAGE
                ? `${evolvedName} hit max evolution. Someone has been training.`
                : `${evolvedName} just leveled up their goat. Your move.`,
            data: {
              fromUid: uid,
              fromName: evolvedName,
              stage: evolution.to.stage,
              tierId: evolution.to.id,
              tierLabel: evolution.to.label,
            },
            read: false,
            createdAt: new Date().toISOString(),
          });
        }
        await batch.commit();
      }
      logger.info('evolution notifications sent', {
        uid,
        stage: evolution.to.stage,
        recipients: recipients.length,
        friends: evolvedFriends.length,
      });
    } catch (err) {
      logger.error('evolution fan-out failed', { uid, error: err?.message });
    }
  }

  return {
    // The tier this workout unlocked, or null. The client runs its own
    // tier-up celebration off the account snapshot (useTierUpCelebration),
    // so nothing depends on this — it is here so the summary screen can
    // name the tier without re-deriving it, and so a caller can tell
    // whether friends were told.
    evolution: evolution
      ? { stage: evolution.to.stage, tierId: evolution.to.id, label: evolution.to.label }
      : null,
    workoutId: workoutRef.id,
    coinsEarned: effectiveCoins,
    // Which exercises a rest-timer boost was applied to, by name, so the
    // celebration can say "2× on Bench Press" under the coin line. The
    // SERVER's list: a token the client pinned that turned out to be
    // expired or spent is simply absent here, which is how the client
    // learns it did not count. Empty for a recovery workout.
    coinBoosts,
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
    // { senderUid, senderName, coins } when this session paid a friend
    // their recommendation bounty — so the summary can tell the finisher
    // that sending them the routine just earned somebody something. null
    // every other time, which is nearly always.
    recommendationBounty,
    // Raw kg moved in THIS session, for the summary screen's volume bar.
    // Returned rather than re-summed on the client, because the client's
    // own set.weight is blank for a bodyweight exercise — the lifter's
    // body weight is folded in here, server-side. A client-side sum would
    // report a full pull-up session as 0 kg.
    totalVolumeKg,
    // Wall-clock length of the session, from the stored start to the
    // stored finish — the celebration's headline stat. Computed here for
    // the same reason totalVolumeKg is returned rather than re-derived:
    // the client's own `startedAt` may have been clamped on the way in,
    // and two different durations for one workout is a bug report.
    durationMs,
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
