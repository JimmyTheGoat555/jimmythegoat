// "Every new user is automatically friends with Jimmy" — claimed once the
// account is real.
//
// ── WHY NOT functions.auth.user().onCreate ───────────────────────────────
//
// That was the brief, and it is the wrong hook here for three reasons,
// the first of which is not a style preference:
//
// 1. IT WOULD BREAK SIGN-UP. An Auth onCreate trigger fires the moment the
//    Auth account exists — BEFORE the client writes users/{uid}. If it
//    touched that document first, signUp's own create would land as an
//    UPDATE, and firestore.rules' userUpdateFieldsAllowed() is a
//    hasOnly() list with no `role`, `email` or `createdAt` in it. The
//    write would be denied and the account left half-made. That is not
//    hypothetical: onboarding.js's header is the post-mortem of the last
//    time a write raced signUp and silently took half of it down.
//
// 2. IT CANNOT FIRE ON VERIFICATION. The brief asks for "sign-up AND email
//    verification". Firebase has no trigger for a verified email —
//    onCreate fires at account creation, and nothing fires when a link is
//    clicked. The only place that fact becomes known is a client that
//    reloads the user, or a server that looks it up.
//
// 3. IT IS 1ST-GEN. Every function in this codebase is
//    firebase-functions/v2; auth.user() exists only in v1.
//
// So: a callable, fired by the app the moment the gate opens, with the
// verification checked SERVER-SIDE against the Auth record rather than
// the caller's ID token — a token minted before the link was clicked
// still says false, which would refuse the very users this is for.
//
// Idempotent (arrayUnion), so calling it on every launch costs one read.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');
const { friendWithOfficialAccount, officialAccountUid } = require('./officialAccount');

exports.claimWelcomeFriend = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;

  // Authoritative, and deliberately not request.auth.token.email_verified:
  // that rides on a token issued at sign-in, and somebody who just
  // confirmed their address in a mail app is carrying a stale `false`.
  const user = await getAuth().getUser(uid);
  if (!user.emailVerified) return { friended: false, reason: 'unverified' };

  // Waiting for verification is the point rather than an accident of
  // placement: the app is hard-gated on a confirmed address, so an
  // unverified account is one that cannot train, cannot post, and would
  // sit in the official account's friends list forever as a dead entry —
  // counting against the 30 that its own feed can actually read.
  const friended = await friendWithOfficialAccount(uid);

  // The official account's uid goes back to the caller so the app can tell
  // "this friend is Jimmy" without guessing from a display name — which is
  // a string any user is free to set to 'Jimmy'. Not a disclosure: Jimmy is
  // in every user's own friends array already, and feed posts are readable
  // by every signed-in user (firestore.rules). The client uses it for one
  // thing, showing the welcome banner to somebody who really is connected.
  return { friended, officialUid: await officialAccountUid() };
});
