// Coins for watching a rewarded video.
//
// ── READ THIS BEFORE TRUSTING IT ─────────────────────────────────────────
//
// Moving the coin write to the server is necessary and NOT sufficient, and
// the difference matters enough to write down. The client cannot grant
// itself coins any more — firestore.rules has always kept `coins` out of
// reach (serverManagedFieldsUnchanged) — but this function still takes the
// client's word that an ad was watched at all. `httpsCallable('rewardAdView')`
// from a devtools console is indistinguishable from a finished video.
//
// So what actually bounds this today is the rate limit below: five a day,
// per account (guards.js). That is the whole security model while the ad
// is simulated, and it is a budget cap rather than a proof.
//
// THAT FIX NOW EXISTS: functions/admobSsv.js verifies AdMob's signed
// callback and grants the reward from it, with the app nowhere in the
// path. This callable stays only for the pre-launch simulated ad on web,
// and it switches ITSELF off the moment real ads go live — see
// AD_REWARD_REQUIRES_SSV below and in storeCatalog.js. Two paths into the
// coin supply, one proven and one taken on trust, means only the second
// ever gets used.
//
// WHAT AN AD CAN NEVER GRANT: volume, score, a personal record, a badge,
// a streak day, or anything else that claims somebody lifted something.
// Coins are a currency and can come from anywhere; the rest is a record of
// work, and a record you can buy is not a record. See economy.js, which
// remains the only writer of every one of those fields.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { AD_REWARD_COINS, AD_REWARD_REQUIRES_SSV } = require('./storeCatalog');
const { enforceRateLimit } = require('./guards');

exports.rewardAdView = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  // Real ads are live: rewards arrive through AdMob's signed callback and
  // this path is closed. Kept as a refusal rather than deleted so a client
  // still shipping the old flow gets a clear answer instead of a 404 it
  // might retry forever.
  if (AD_REWARD_REQUIRES_SSV) {
    throw new HttpsError('failed-precondition', 'Ad rewards are granted by AdMob verification now.');
  }
  const uid = request.auth.uid;

  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);

  // Consumed BEFORE the credit, and it throws 'resource-exhausted' on the
  // sixth view of the day. Ordering is the point: a limiter checked after
  // the write is a limiter that pays out first.
  await enforceRateLimit(uid, 'adReward');

  // In a transaction so two calls racing each other cannot both read the
  // same starting balance — the increment itself is atomic, but the
  // balance this returns to the client would otherwise be wrong, and the
  // existence check has to happen against the same snapshot.
  const newBalance = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      throw new HttpsError('failed-precondition', "Your profile doc doesn't exist yet — try again in a moment.");
    }
    const coins = Number(snap.data().coins) || 0;
    tx.update(userRef, {
      coins: FieldValue.increment(AD_REWARD_COINS),
      // Mirrored onto the user's own doc purely so the CLIENT can know
      // the daily reward is spent without asking. The authoritative
      // counter is rateLimits/{uid}, which is closed to clients by rule
      // (and must stay that way — it is the thing a devtools session
      // would reset), so without this mirror a refresh wipes the app's
      // only memory of the claim and the card cheerfully offers an ad
      // that can no longer pay. The cap never depended on this and still
      // does not: it is a hint for the UI, and the limiter above is the
      // boundary.
      lastAdRewardAt: new Date().toISOString(),
    });
    return coins + AD_REWARD_COINS;
  });

  return { coinsAwarded: AD_REWARD_COINS, newBalance };
});
