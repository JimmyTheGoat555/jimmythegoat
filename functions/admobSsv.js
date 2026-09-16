// AdMob Server-Side Verification — the real answer to "how do we know an
// ad was actually watched".
//
// ── WHAT CHANGES ─────────────────────────────────────────────────────────
//
// Until now the app told the server "I watched an ad" and the server
// believed it, bounded only by a daily cap. That cap is a budget, not a
// proof: a devtools console could claim the reward exactly as well as a
// finished video could.
//
// With SSV, GOOGLE calls this endpoint, over the public internet, with a
// query string it has signed. The app is no longer in the reward path at
// all — it cannot claim, cannot replay, and cannot be believed, because
// nothing it says is read here.
//
// ── HOW THE PROOF WORKS ──────────────────────────────────────────────────
//
// AdMob appends `signature` and `key_id` as the LAST two query
// parameters. The signed message is the raw query string up to (but not
// including) `&signature=`. The signature is ECDSA-SHA256, DER encoded,
// web-safe base64. The public keys live at a fixed Google URL, keyed by
// `key_id`, and rotate — so they are fetched and cached rather than
// pasted in.
//
// Verifying the signature proves the callback came from Google. It does
// NOT prove it is fresh or unique, so two more checks follow:
//
//   * transaction_id is recorded and replays are dropped. AdMob retries
//     on failure, and a retry must not pay twice.
//   * the callback is rejected if it is older than MAX_CALLBACK_AGE_MS,
//     so a captured URL cannot be replayed weeks later.
//
// ── SETUP (console, not code) ────────────────────────────────────────────
//
// In AdMob → the rewarded ad unit → Server-side verification, set the
// callback URL to this function's trigger URL. The client must also call
// setServerSideVerificationOptions({ userId }) BEFORE showing the ad —
// that is what arrives here as `user_id` and decides who gets paid.
const { onRequest } = require('firebase-functions/v2/https');
const { createVerify } = require('crypto');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { AD_REWARD_COINS, REST_BOOST_SSV_CUSTOM_DATA } = require('./storeCatalog');
const { grantRestBoost } = require('./restBoost');

const VERIFIER_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
// Keys rotate on the order of months; an hour of cache turns a per-callback
// network round trip into a rare one without pinning a retired key.
const KEY_CACHE_MS = 60 * 60 * 1000;
// A signed callback older than this is refused. Generous enough for
// AdMob's own retries, short enough that a captured URL is worthless by
// the time anybody finds it.
const MAX_CALLBACK_AGE_MS = 60 * 60 * 1000;

let keyCache = { fetchedAt: 0, byId: new Map() };

async function verifierKeys() {
  if (Date.now() - keyCache.fetchedAt < KEY_CACHE_MS && keyCache.byId.size > 0) return keyCache.byId;
  const response = await fetch(VERIFIER_KEYS_URL);
  if (!response.ok) throw new Error(`verifier keys ${response.status}`);
  const { keys } = await response.json();
  keyCache = {
    fetchedAt: Date.now(),
    byId: new Map((keys ?? []).map((k) => [String(k.keyId), k.pem])),
  };
  return keyCache.byId;
}

// The message Google signed: everything before `&signature=`. Taken from
// the RAW query string rather than rebuilt from parsed params — re-encoding
// would change the bytes and the signature would never match.
function signedMessage(rawQuery) {
  const marker = rawQuery.indexOf('&signature=');
  return marker === -1 ? null : rawQuery.slice(0, marker);
}

exports.admobRewardCallback = onRequest({ cors: false }, async (req, res) => {
  // Google sends a GET. Anything else is not AdMob.
  if (req.method !== 'GET') {
    res.status(405).send('method not allowed');
    return;
  }

  const rawQuery = req.originalUrl.split('?')[1] ?? '';
  const params = new URLSearchParams(rawQuery);
  const signature = params.get('signature');
  const keyId = params.get('key_id');
  const userId = params.get('user_id');
  const transactionId = params.get('transaction_id');
  const timestamp = Number(params.get('timestamp'));
  // Which reward this ad was shown for. The client sets it with the user
  // id before the ad is fetched (useRewardedAd's prepare) and AdMob echoes
  // it back inside the signed query, so it is as trustworthy as user_id:
  // the app cannot change it after the fact, and a callback without it is
  // the ordinary coin ad.
  const armsBoost = params.get('custom_data') === REST_BOOST_SSV_CUSTOM_DATA;

  const message = signedMessage(rawQuery);
  if (!signature || !keyId || !userId || !transactionId || !message) {
    res.status(400).send('malformed callback');
    return;
  }

  // ── Is it really from Google? ──
  let pem;
  try {
    pem = (await verifierKeys()).get(String(keyId));
  } catch {
    // Could not reach the key server. 500 rather than 200: AdMob retries
    // on a 5xx, and a reward we could not verify is one we must not drop
    // silently either.
    res.status(500).send('key fetch failed');
    return;
  }
  if (!pem) {
    res.status(400).send('unknown key id');
    return;
  }

  const verifier = createVerify('SHA256');
  verifier.update(message);
  verifier.end();
  // Web-safe base64, DER-encoded ECDSA — Node's default dsaEncoding.
  if (!verifier.verify(pem, Buffer.from(signature, 'base64url'))) {
    res.status(403).send('bad signature');
    return;
  }

  // ── Is it fresh? ──
  // AdMob's timestamp is milliseconds since epoch.
  if (Number.isFinite(timestamp) && Math.abs(Date.now() - timestamp) > MAX_CALLBACK_AGE_MS) {
    res.status(400).send('stale callback');
    return;
  }

  const db = getFirestore();
  const userRef = db.collection('users').doc(userId);
  const seenRef = db.collection('adRewardTransactions').doc(transactionId);

  try {
    const paid = await db.runTransaction(async (tx) => {
      // ── Is it new? ──
      // The transaction id is the idempotency key. AdMob retries a
      // callback it did not get a 200 for, and without this a retry is a
      // second payout for one ad.
      if ((await tx.get(seenRef)).exists) return false;
      const userSnap = await tx.get(userRef);
      // An unknown user_id is not an error worth retrying — the client
      // sets it, and a wrong one will still be wrong next time. Recorded
      // so the retry is cheap.
      if (!userSnap.exists) {
        tx.set(seenRef, { userId, at: FieldValue.serverTimestamp(), paid: false, reason: 'unknown-user' });
        return false;
      }

      // A rest-timer ad arms a 2× token instead of paying coins — see
      // functions/restBoost.js. Read before the writes below, as every
      // read in a transaction must be. No daily gate on this path: Google
      // is the caller, and refusing a verified view would charge someone
      // an ad for nothing. The client hides the offer once the day's
      // budget is spent, and the pending-list bound inside grantRestBoost
      // is the backstop.
      if (armsBoost) {
        const economyRef = userRef.collection('meta').doc('economy');
        const economySnap = await tx.get(economyRef);
        const grant = grantRestBoost(economySnap.exists ? economySnap.data() : {}, Date.now());
        if (!grant) {
          tx.set(seenRef, { userId, at: FieldValue.serverTimestamp(), paid: false, reason: 'boost-cap' });
          return false;
        }
        tx.set(seenRef, { userId, at: FieldValue.serverTimestamp(), paid: true, reward: 'rest-boost' });
        tx.set(economyRef, grant.update, { merge: true });
        return true;
      }

      tx.set(seenRef, { userId, at: FieldValue.serverTimestamp(), paid: true });
      tx.update(userRef, {
        coins: FieldValue.increment(AD_REWARD_COINS),
        // Same mirror the callable wrote, for the same reason: the Store
        // card reads it to know the daily reward is spent without asking.
        lastAdRewardAt: new Date().toISOString(),
      });
      return true;
    });
    // 200 either way once the callback is understood — a replay is a
    // success from AdMob's point of view, and answering anything else
    // asks it to retry forever.
    res.status(200).send(paid ? 'ok' : 'duplicate');
  } catch {
    res.status(500).send('write failed');
  }
});
