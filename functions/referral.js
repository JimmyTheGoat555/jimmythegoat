// Referral bonus: an existing user shares their own friendCode (the same
// code used to add friends — see social.js), and when someone signs up
// WITH it, that existing user is credited REFERRAL_BONUS_COINS once.
//
// Deliberately NOT auto-friending the pair. `friends` on users/{uid} is a
// server-managed field precisely because a friendship needs BOTH sides'
// consent (see firestore.rules and social.js's respondToFriendRequest) —
// letting a signup-time code unilaterally wire up a friendship would be
// exactly the one-sided list write that rule exists to block. The
// referred user can send a normal friend request afterward if they want
// to actually connect; the coin reward for inviting them doesn't depend
// on it.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { enforceRateLimit } = require('./guards');
const { REFERRAL_BONUS_COINS } = require('./storeCatalog');

// Called by the client right after signup (best-effort, same pattern as
// the trainer-code lookup in useAuth.js's signUp — a bad/missing/expired
// code never fails the account, it just means no bonus changes hands).
exports.claimReferral = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const code = String(request.data?.code ?? '').trim().toUpperCase();
  if (!code) throw new HttpsError('invalid-argument', 'Missing referral code.');

  const db = getFirestore();
  // Same lookup table sendFriendRequest() resolves a code through — see
  // firestore.rules' friendCodes match for why this has to be a plain
  // get()-by-id rather than a query.
  const codeSnap = await db.collection('friendCodes').doc(code).get();
  if (!codeSnap.exists) throw new HttpsError('not-found', "That code doesn't match anyone.");
  const referrerUid = codeSnap.data().uid;
  if (referrerUid === uid) throw new HttpsError('invalid-argument', "You can't refer yourself.");

  const newUserRef = db.collection('users').doc(uid);
  const referrerRef = db.collection('users').doc(referrerUid);

  const newUserSnap = await newUserRef.get();
  if (!newUserSnap.exists) {
    throw new HttpsError('failed-precondition', "Your profile doc doesn't exist yet — try again in a moment.");
  }
  // A code can only ever be claimed once per account — checked up front so
  // a retried/double-fired call can't double-credit the referrer.
  if (newUserSnap.data().referredBy) {
    return { credited: false, reason: 'already-claimed' };
  }

  // Checked BEFORE crediting, and this callable is best-effort from the
  // client's side (same as the trainer-code lookup at signup) — a
  // capped-out referral just means no coins change hands this time, never
  // a failed signup for the new user.
  await enforceRateLimit(referrerUid, 'referralCredit');

  await db.runTransaction(async (tx) => {
    const [freshNewUserSnap, referrerSnap] = await Promise.all([tx.get(newUserRef), tx.get(referrerRef)]);
    if (!referrerSnap.exists) throw new HttpsError('not-found', "That referrer's account doesn't exist anymore.");
    // Lost a race with another claim attempt for this same new account —
    // idempotent no-op rather than a double credit.
    if (freshNewUserSnap.data()?.referredBy) return;

    tx.update(newUserRef, { referredBy: referrerUid, referredAt: new Date().toISOString() });
    tx.update(referrerRef, { coins: FieldValue.increment(REFERRAL_BONUS_COINS) });
  });

  return { credited: true };
});
