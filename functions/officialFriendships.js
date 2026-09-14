// The callable wrapper around the one-time backfill — see
// officialAccount.js for what it does and why it is gated on being the
// official account rather than on a secret.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { backfillOfficialFriendships } = require('./officialAccount');

exports.friendEveryoneWithJimmy = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const result = await backfillOfficialFriendships(request.auth.uid);
  if (!result.ran && result.reason === 'not-official-account') {
    throw new HttpsError('permission-denied', 'Only the Jimmy account can run this.');
  }
  if (!result.ran && result.reason === 'no-official-account') {
    throw new HttpsError('failed-precondition', 'The Jimmy account does not exist yet — create it first.');
  }
  return result;
});
