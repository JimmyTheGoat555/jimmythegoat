// Shared preconditions for the callables that reach OTHER users — the
// outbound social actions (friend requests, nudges, workout
// recommendations, the trainee → trainer weigh-in ping). These are the
// surface a scripted client would use to spam or Sybil-flood real people.
//
// There used to be a second gate here, requireVerifiedEmail, on the theory
// that a throwaway unverified address should not be able to put a
// notification in a stranger's inbox. It was removed at the owner's
// request. In practice it was not buying what it looked like it bought:
// sign-up sends exactly one confirmation mail, best-effort, and nothing
// ever asked again — so 29 of 31 real accounts were unverified and simply
// locked out of adding friends at all. A gate almost nobody can pass is a
// broken feature, not a security control.
//
// enforceRateLimit is what actually stops the abuse, and is untouched: a
// rolling-window / per-target cooldown counter kept in the Admin-only
// `rateLimits/{uid}` collection (see firestore.rules: `allow read, write:
// if false` — the client can neither read nor reset it). It caps friend
// requests at 20/hour, nudges at one per person per hour with a global
// 15/hour backstop, workout recommendations at one per person per ten
// minutes with a global 20/hour, and it does not care whether an address
// is confirmed.
// One extra read + write per guarded call.
//
// Note what verification WAS worth, in case this is ever reconsidered: it
// raised the cost of creating disposable accounts. The rate limits are
// per-uid, so someone willing to register repeatedly can still fan out
// across fresh accounts. That is the hole this leaves open, and the honest
// fix for it is a signup-side control (a captcha, or per-IP registration
// limits), not a gate on an email nobody receives.
const { HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');

// `request.auth.token` is the decoded ID token. For email/password
// accounts `email_verified` is false until the user clicks the link;
// providers like Google mint it already true, so a bare `=== true` check
// is correct for every sign-in method without branching on the provider.

// Prunes anything older than `windowMs` from `timestamps` (an array of
// epoch-ms numbers) and returns what's left, newest-last.
function withinWindow(timestamps, windowMs, now) {
  const cutoff = now - windowMs;
  return (Array.isArray(timestamps) ? timestamps : []).filter((t) => typeof t === 'number' && t > cutoff);
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Tunables, all deliberately generous for a real user and still far below
// what a spam script wants:
const LIMITS = {
  // Friend requests: a rolling hourly cap. Cycling through random friend
  // codes to blast requests is the abuse case; 20/hour is far past what
  // anyone adds legitimately in a sitting.
  friendRequest: { windowMs: HOUR_MS, max: 20 },
  // Nudges: a hard per-friend cooldown (you can't nudge the SAME person
  // more than once an hour, which is the actually-annoying pattern) plus a
  // global hourly cap as a backstop against fanning out across many
  // friends at once.
  nudgePerTarget: { cooldownMs: HOUR_MS },
  nudgeGlobal: { windowMs: HOUR_MS, max: 15 },
  // Recommending one of your saved routines to a friend
  // (functions/recommendWorkout.js). Same shape as a nudge, looser
  // numbers, and the reason is that the annoying pattern is different:
  // nudging the same person twice in an hour is nagging, whereas sending
  // them your push day and then your leg day in the same sitting is the
  // feature working. Ten minutes is enough to stop a tap-loop; the hourly
  // cap is what actually bounds a script.
  recommendPerTarget: { cooldownMs: 10 * 60 * 1000 },
  recommendGlobal: { windowMs: HOUR_MS, max: 20 },
  // Trainee → trainer weigh-in notification (functions/coaching.js's
  // notifyTrainer). A real person logs a weigh-in a couple of times a day
  // at most; 6/hour is generous and still stops a script from flooding a
  // trainer's inbox.
  weighInNotify: { windowMs: HOUR_MS, max: 6 },
  // How many times any ONE referrer can be paid out in a day
  // (functions/referral.js). Keyed on the REFERRER's own uid, not the
  // caller — a script can't mass-create throwaway accounts against a
  // single code to farm coins for whoever holds it. 20/day is far past
  // what a real invite loop needs and still lets a code go genuinely
  // viral for a day without every referral silently failing to pay out.
  referralCredit: { windowMs: DAY_MS, max: 20 },
  // Rewarded ad views (functions/rewardAdView.js). This is the ONLY thing
  // standing between the reward callable and an unbounded coin faucet —
  // see that file's header for why the callable cannot verify that an ad
  // was really watched.
  //
  // ONE a day, at the owner's call, and it is the right number: a view is
  // worth 50 coins against a training session's ~200, so a daily cap of
  // one leaves lifting comfortably the best way to earn and caps a
  // scripted client at 50 coins a day. Rolling 24h from the last view,
  // not a midnight reset — same reasoning as the workout window.
  adReward: { windowMs: DAY_MS, max: 1 },
};

// Rolling-window caps with no per-target dimension. `field` names a live
// document key in `rateLimits` — renaming one silently hands every
// existing user a fresh budget, so don't.
const WINDOWED_ACTIONS = {
  friendRequest: {
    limit: LIMITS.friendRequest,
    field: 'friendRequests',
    message: "You're sending friend requests too fast — take a breather and try again later.",
  },
  weighInNotify: {
    limit: LIMITS.weighInNotify,
    field: 'weighInNotify',
    message: 'Too many weigh-in updates in a short window — try again later.',
  },
  referralCredit: {
    limit: LIMITS.referralCredit,
    field: 'referralCredits',
    message: 'This referral code has reached its daily reward limit.',
  },
  adReward: {
    limit: LIMITS.adReward,
    field: 'adRewards',
    message: "You've claimed today's ad reward — come back tomorrow for the next one.",
  },
};

// The two actions that reach one named person at a time. Everything in
// here is data, not logic — see the shared branch inside the transaction.
const PER_TARGET_ACTIONS = {
  nudge: {
    cooldownMs: LIMITS.nudgePerTarget.cooldownMs,
    global: LIMITS.nudgeGlobal,
    targetsField: 'nudgeTargets',
    globalField: 'nudgesGlobal',
    cooldownMessage: 'You already nudged them recently — give it an hour before the next one.',
    globalMessage: "You've sent a lot of nudges in the last hour — ease off for a bit.",
  },
  workoutRecommendation: {
    cooldownMs: LIMITS.recommendPerTarget.cooldownMs,
    global: LIMITS.recommendGlobal,
    targetsField: 'recommendTargets',
    globalField: 'recommendsGlobal',
    cooldownMessage: 'You just sent them a workout — give it a few minutes before the next one.',
    globalMessage: "You've shared a lot of workouts in the last hour — ease off for a bit.",
  },
};

// Throws HttpsError('resource-exhausted', ...) when the caller is over the
// limit for `action`; otherwise records this call and returns. `targetUid`
// is only used by per-target actions (see PER_TARGET_ACTIONS) — omit it
// for global ones.
async function enforceRateLimit(uid, action, targetUid) {
  const db = getFirestore();
  const ref = db.collection('rateLimits').doc(uid);
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};

    // Plain rolling-window caps. Four of these now, so they are a table
    // rather than four copies of the same six lines — the copies are how
    // the fifth one gets written with the wrong field name.
    const windowedSpec = WINDOWED_ACTIONS[action];
    if (windowedSpec) {
      const { limit, field, message } = windowedSpec;
      const recent = withinWindow(data[field], limit.windowMs, now);
      if (recent.length >= limit.max) throw new HttpsError('resource-exhausted', message);
      recent.push(now);
      tx.set(ref, { [field]: recent }, { merge: true });
      return;
    }

    // Per-target cooldown + global hourly backstop. Two actions share
    // this shape, so it is written once: hammering ONE person is the
    // pattern that actually reaches a human as harassment, and the global
    // cap is what stops the same script fanning out across a whole friend
    // list instead. Counter field names are per-action and must not be
    // renamed — they are live documents in `rateLimits`, and a rename
    // silently hands every existing user a fresh budget.
    const perTargetSpec = PER_TARGET_ACTIONS[action];
    if (perTargetSpec) {
      const { cooldownMs, global, targetsField, globalField, cooldownMessage, globalMessage } = perTargetSpec;
      const stored = data[targetsField];
      const perTarget = stored && typeof stored === 'object' ? { ...stored } : {};
      const last = perTarget[targetUid];
      if (typeof last === 'number' && now - last < cooldownMs) {
        throw new HttpsError('resource-exhausted', cooldownMessage);
      }
      const recentGlobal = withinWindow(data[globalField], global.windowMs, now);
      if (recentGlobal.length >= global.max) {
        throw new HttpsError('resource-exhausted', globalMessage);
      }
      // Drop cooldown entries that have fully expired so the map can't grow
      // without bound as a user's friend list churns over months.
      for (const [key, ts] of Object.entries(perTarget)) {
        if (typeof ts !== 'number' || now - ts >= cooldownMs) delete perTarget[key];
      }
      perTarget[targetUid] = now;
      recentGlobal.push(now);
      tx.set(ref, { [targetsField]: perTarget, [globalField]: recentGlobal }, { merge: true });
      return;
    }

    throw new HttpsError('internal', `Unknown rate-limit action: ${action}`);
  });
}

module.exports = { enforceRateLimit };
