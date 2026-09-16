// Who counts as the app's admin, and the gate every admin-only callable
// runs first.
//
// WHY THIS IS NOT officialAccount.js. The two constants below and in
// officialAccount.js hold the same address today, and that is a
// coincidence worth keeping separate rather than a fact worth
// deduplicating. OFFICIAL_ACCOUNT_EMAIL answers "whose feed does every new
// user get auto-friended with" — a product decision with no privileges
// attached (that file says so in its own header, and it is right). This
// one answers "who may read every account's email address". If the owner
// ever hands the Jimmy persona to a community manager, exactly one of
// these two should move, and a shared constant would move both silently.
//
// WHY THE UID IS RESOLVED FROM AUTH RATHER THAN READ OFF THE TOKEN. The
// obvious check is `request.auth.token.email === ADMIN_EMAIL`, and it
// would very probably be fine — Firebase mints that claim itself and a
// client cannot forge it. Resolving the uid instead is stronger for two
// concrete reasons: the app has a change-email flow (useAuth's
// changeEmail), and an ID token is a snapshot minted up to an hour before
// it is used, so a token can carry an address the account no longer has.
// Comparing uids asks Auth what is true NOW. It costs one lookup per cold
// instance, cached for the life of the instance exactly as
// officialAccount.js caches its own.
const { HttpsError } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');

const ADMIN_EMAIL = 'jimmythegoat.app@gmail.com';

// `undefined` = never looked. `null` = looked and the account does not
// exist, which is cached too so a misconfigured project does not pay an
// Auth round trip on every rejected call.
let cachedUid;

async function adminUid() {
  if (cachedUid !== undefined) return cachedUid;
  try {
    cachedUid = (await getAuth().getUserByEmail(ADMIN_EMAIL)).uid;
  } catch {
    cachedUid = null;
  }
  return cachedUid;
}

// Throws unless the caller IS the admin account. Note the two failure
// modes are deliberately different errors: not signed in is
// 'unauthenticated' (the client can fix that by signing in), anything
// else is 'permission-denied'.
//
// FAILS CLOSED. If the admin account cannot be resolved at all — the
// project has no such user, or the Auth lookup itself failed — `adminUid`
// returns null and every caller is denied. The alternative (treat an
// unresolvable admin as "allow") would turn one bad deploy into an open
// door onto every user's email address.
async function requireAppAdmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = await adminUid();
  if (!uid || request.auth.uid !== uid) {
    // Deliberately says nothing about WHY. An admin knows they are the
    // admin; anyone else learns only that this door is shut, not whether
    // the admin account exists or what address it uses.
    throw new HttpsError('permission-denied', 'Admins only.');
  }
  return uid;
}

// ── The admin bypass ─────────────────────────────────────────────────────
//
// Whether a uid IS the admin account. Separate from requireAppAdmin
// because these are two different questions asked at two different moments:
// requireAppAdmin is a DOOR (get out if you are not the admin), while this
// is a BRANCH taken mid-request by code that runs for everybody — the rate
// limiter and the workout cooldown.
//
// WHAT THIS IS FOR, precisely: skipping throttles the owner hits while
// testing, and nothing else. It does not grant data access, it is not
// consulted by any rule, and it is deliberately not wired into anything
// that validates a workout, prices an item, or decides a reward. Those
// stay identical for every account including this one, because an admin
// path through the economy is an admin path that never gets tested.
//
// Same Auth-resolved answer requireAppAdmin uses, same per-instance cache,
// and the same fail-closed default: an unresolvable admin account makes
// this false for everybody, so a misconfigured project throttles the owner
// rather than exempting the world.
async function isAppAdminUid(uid) {
  if (!uid) return false;
  const adminId = await adminUid();
  return adminId !== null && uid === adminId;
}

// Exported for the test harness, which needs to reset the cache between
// cases. Nothing in production should call it.
function _resetAdminCache() {
  cachedUid = undefined;
}

module.exports = { ADMIN_EMAIL, requireAppAdmin, isAppAdminUid, _resetAdminCache };
