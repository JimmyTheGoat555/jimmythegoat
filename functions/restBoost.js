// The rest-timer ad → a one-use 2× coin token.
//
// ── WHAT THIS IS, AND IS NOT ────────────────────────────────────────────
//
// rewardAdView pays coins for an ad. This pays a MULTIPLIER on coins the
// lifter still has to earn: the token armed here is redeemed by logWorkout
// (economy.js) against one exercise of the workout it is spent on, and
// that exercise's first REST_BOOST_MAX_SETS sets are doubled — three
// doubled sets, not an exercise that doubles for as long as somebody
// keeps adding rows to it (see storeCatalog.js). Nothing else about the
// workout changes — volume, score, records, badges, the tier — because an
// ad may never claim that somebody lifted something (see the header of
// rewardAdView.js; this is the same rule one level up).
//
// ── WHY A TOKEN ON meta/economy ─────────────────────────────────────────
//
// The obvious design — an `isDoubled: true` flag on the exercise the
// client sends — is worthless, because the client sends it. So the flag
// lives where the client cannot write: users/{uid}/meta/economy is closed
// to every client write by firestore.rules (it is the document that holds
// the workout cooldown, for the same reason). The ad claim appends
// `{ id, grantedAt }` to `restBoosts` here; the workout payload names that
// id on ONE exercise; logWorkout, inside its own transaction, checks the id
// is pending and unexpired, applies the multiplier to that exercise only,
// and removes the token in the same write. A forged id matches nothing and
// doubles nothing. A real id sent twice is consumed the first time.
//
// The owner can READ the document, and the client relies on that: it is
// how the timer knows a boost is armed (after a refresh too, and when the
// grant arrived out of band through AdMob's callback), and how it knows
// today's budget is spent before somebody sits through an ad that cannot
// pay. `restBoostClaimsAt` is to this feature what users/{uid}.lastAdRewardAt
// is to the daily coin ad — a mirror for the UI, never the limit itself.
// The limit is rateLimits/{uid}, which no client can read or reset.
//
// ── THE SAME HONESTY NOTE AS rewardAdView.js ────────────────────────────
//
// Until real ads are live this callable takes the client's word that a
// video played, bounded by the daily cap in guards.js. Once
// AD_REWARD_REQUIRES_SSV is on it refuses, and the token is armed by
// admobRewardCallback from Google's signed callback instead — see the
// `custom_data` branch there, which calls grantRestBoost below.
const { randomUUID } = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { enforceRateLimit } = require('./guards');
const {
  AD_REWARD_REQUIRES_SSV,
  REST_BOOST_MULTIPLIER,
  REST_BOOST_TTL_MS,
  MAX_PENDING_REST_BOOSTS,
} = require('./storeCatalog');

const DAY_MS = 24 * 60 * 60 * 1000;
// Tokens are randomUUID(); anything else in a payload is not one. Checked
// on the way in (economy.js) so a malformed id is rejected before it is
// ever compared against the pending list.
const BOOST_TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// How many claim timestamps the mirror keeps. Only the last day's worth
// matter and the daily cap is far below this; it is a bound, not a budget.
const MAX_CLAIM_HISTORY = 20;

function isFresh(grantedAt, nowMs) {
  const ms = Date.parse(grantedAt);
  return Number.isFinite(ms) && nowMs - ms < REST_BOOST_TTL_MS;
}

// The tokens on a meta/economy document that could still be redeemed
// right now: well-formed and inside the TTL. Everything else is dropped
// on the next write, whichever function makes it — a token is never
// refunded, and an expired one has no reason to stay on the document.
function livePendingBoosts(economy, nowMs) {
  const stored = Array.isArray(economy?.restBoosts) ? economy.restBoosts : [];
  return stored
    .filter(
      (token) =>
        token && typeof token.id === 'string' && BOOST_TOKEN_RE.test(token.id) && isFresh(token.grantedAt, nowMs),
    )
    .map((token) => ({ id: token.id, grantedAt: token.grantedAt }))
    .slice(0, MAX_PENDING_REST_BOOSTS);
}

function recentClaims(economy, nowMs) {
  const stored = Array.isArray(economy?.restBoostClaimsAt) ? economy.restBoostClaimsAt : [];
  return stored.filter((iso) => {
    const ms = Date.parse(iso);
    return Number.isFinite(ms) && nowMs - ms < DAY_MS;
  });
}

// One new token plus the meta/economy update that carries it. Pure over
// the document's current data so the callable below and the AdMob
// callback (admobSsv.js) arm a boost identically, each inside its own
// transaction. Returns null when the pending list is already at its hard
// bound — unreachable through the callable in practice, but the callback
// has no daily gate and a bound with no caller is a bound that will be
// wrong the first time it matters.
function grantRestBoost(economy, nowMs) {
  const pending = livePendingBoosts(economy, nowMs);
  if (pending.length >= MAX_PENDING_REST_BOOSTS) return null;
  const token = { id: randomUUID(), grantedAt: new Date(nowMs).toISOString() };
  return {
    token,
    update: {
      restBoosts: [...pending, token],
      restBoostClaimsAt: [...recentClaims(economy, nowMs), token.grantedAt].slice(-MAX_CLAIM_HISTORY),
    },
  };
}

// Callable from the client via httpsCallable(functions, 'claimRestBoost')
// — see useRewardedAd, which invokes it from the Rewarded event exactly
// as it invokes rewardAdView for the coin ad. Returns the token so the
// timer can show "armed" without waiting for the snapshot; the snapshot
// is still what the client trusts (useRestBoost), so a response lost to a
// dropped connection costs nothing but a moment.
exports.claimRestBoost = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (AD_REWARD_REQUIRES_SSV) {
    throw new HttpsError('failed-precondition', 'Ad rewards are granted by AdMob verification now.');
  }
  const uid = request.auth.uid;

  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);
  const economyRef = userRef.collection('meta').doc('economy');

  // Consumed BEFORE the grant, same ordering as rewardAdView and for the
  // same reason: a limiter checked after the write is a limiter that pays
  // out first.
  await enforceRateLimit(uid, 'restBoost');

  const token = await db.runTransaction(async (tx) => {
    const [userSnap, economySnap] = await Promise.all([tx.get(userRef), tx.get(economyRef)]);
    if (!userSnap.exists) {
      throw new HttpsError('failed-precondition', "Your profile doc doesn't exist yet — try again in a moment.");
    }
    const grant = grantRestBoost(economySnap.exists ? economySnap.data() : {}, Date.now());
    if (!grant) {
      throw new HttpsError('resource-exhausted', 'You already have boosts waiting — spend them on a workout first.');
    }
    // merge:true — the document may not exist yet for an account that has
    // never logged a workout, and nothing else on it is touched.
    tx.set(economyRef, grant.update, { merge: true });
    return grant.token;
  });

  return {
    tokenId: token.id,
    grantedAt: token.grantedAt,
    expiresAt: new Date(Date.parse(token.grantedAt) + REST_BOOST_TTL_MS).toISOString(),
    multiplier: REST_BOOST_MULTIPLIER,
  };
});

module.exports.grantRestBoost = grantRestBoost;
module.exports.livePendingBoosts = livePendingBoosts;
module.exports.BOOST_TOKEN_RE = BOOST_TOKEN_RE;
