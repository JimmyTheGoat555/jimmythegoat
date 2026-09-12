// Shared preconditions for the callables that reach OTHER users — the
// outbound social actions (friend requests, nudges, the trainee → trainer
// weigh-in ping). These are the surface a scripted client would use to spam
// or Sybil-flood real people.
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
// 15/hour backstop, and it does not care whether an address is confirmed.
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
};

// Throws HttpsError('resource-exhausted', ...) when the caller is over the
// limit for `action`; otherwise records this call and returns. `targetUid`
// is only used by per-target actions (nudges) — omit it for global ones.
async function enforceRateLimit(uid, action, targetUid) {
  const db = getFirestore();
  const ref = db.collection('rateLimits').doc(uid);
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};

    if (action === 'friendRequest') {
      const recent = withinWindow(data.friendRequests, LIMITS.friendRequest.windowMs, now);
      if (recent.length >= LIMITS.friendRequest.max) {
        throw new HttpsError('resource-exhausted', "You're sending friend requests too fast — take a breather and try again later.");
      }
      recent.push(now);
      tx.set(ref, { friendRequests: recent }, { merge: true });
      return;
    }

    if (action === 'weighInNotify') {
      const recent = withinWindow(data.weighInNotify, LIMITS.weighInNotify.windowMs, now);
      if (recent.length >= LIMITS.weighInNotify.max) {
        throw new HttpsError('resource-exhausted', 'Too many weigh-in updates in a short window — try again later.');
      }
      recent.push(now);
      tx.set(ref, { weighInNotify: recent }, { merge: true });
      return;
    }

    if (action === 'referralCredit') {
      const recent = withinWindow(data.referralCredits, LIMITS.referralCredit.windowMs, now);
      if (recent.length >= LIMITS.referralCredit.max) {
        throw new HttpsError('resource-exhausted', "This referral code has reached its daily reward limit.");
      }
      recent.push(now);
      tx.set(ref, { referralCredits: recent }, { merge: true });
      return;
    }

    if (action === 'nudge') {
      const perTarget = data.nudgeTargets && typeof data.nudgeTargets === 'object' ? { ...data.nudgeTargets } : {};
      const last = perTarget[targetUid];
      if (typeof last === 'number' && now - last < LIMITS.nudgePerTarget.cooldownMs) {
        throw new HttpsError('resource-exhausted', 'You already nudged them recently — give it an hour before the next one.');
      }
      const recentGlobal = withinWindow(data.nudgesGlobal, LIMITS.nudgeGlobal.windowMs, now);
      if (recentGlobal.length >= LIMITS.nudgeGlobal.max) {
        throw new HttpsError('resource-exhausted', "You've sent a lot of nudges in the last hour — ease off for a bit.");
      }
      // Drop cooldown entries that have fully expired so the map can't grow
      // without bound as a user's friend list churns over months.
      for (const [key, ts] of Object.entries(perTarget)) {
        if (typeof ts !== 'number' || now - ts >= LIMITS.nudgePerTarget.cooldownMs) delete perTarget[key];
      }
      perTarget[targetUid] = now;
      recentGlobal.push(now);
      tx.set(ref, { nudgeTargets: perTarget, nudgesGlobal: recentGlobal }, { merge: true });
      return;
    }

    throw new HttpsError('internal', `Unknown rate-limit action: ${action}`);
  });
}

module.exports = { enforceRateLimit };
