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
// THE REAL FIX, when AdMob goes in: Server-Side Verification. AdMob calls
// a URL you register with a signed query string (ad_network, ad_unit,
// reward_amount, user_id, signature, key_id); you verify the ECDSA
// signature against Google's published keys, and reward from THAT request
// — not from the app. The app stops being in the reward path entirely.
// When that happens, this file becomes an onRequest handler that verifies
// the signature, and this callable is deleted rather than kept "just for
// testing", because a second unverified path into the coin supply is the
// only thing anyone would ever use.
//
// WHAT AN AD CAN NEVER GRANT: volume, score, a personal record, a badge,
// a streak day, or anything else that claims somebody lifted something.
// Coins are a currency and can come from anywhere; the rest is a record of
// work, and a record you can buy is not a record. See economy.js, which
// remains the only writer of every one of those fields.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { AD_REWARD_COINS } = require('./storeCatalog');
const { enforceRateLimit } = require('./guards');

exports.rewardAdView = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
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
    tx.update(userRef, { coins: FieldValue.increment(AD_REWARD_COINS) });
    return coins + AD_REWARD_COINS;
  });

  return { coinsAwarded: AD_REWARD_COINS, newBalance };
});
