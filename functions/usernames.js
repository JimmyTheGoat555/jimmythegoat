// Globally unique display names, and the one write path that renames an
// account.
//
// ── WHY A RESERVATION COLLECTION AND NOT A QUERY ─────────────────────────
//
// The obvious check is "query `users` for this name, reject if anything
// comes back". That is not an enforcement mechanism, it is a race: two
// signups a millisecond apart both read "free" and both write. Firestore
// has exactly one primitive that makes a name unique — a document ID —
// so the name itself IS the key:
//
//   usernames/{key}  ->  { uid, displayName, claimedAt }
//
// Two accounts cannot hold one document, and a transaction that reads the
// key and writes it in the same commit cannot interleave with another.
// Same trick friendCodes/{code} and trainerCodes/{code} already use here.
//
// ── WHY THE CLIENT CANNOT WRITE IT ───────────────────────────────────────
//
// `usernames` is `allow read: if signedIn(); allow write: if false` and
// `displayName` has been removed from users/{uid}'s update allowlist
// (firestore.rules). Renaming now means calling claimUsername, full stop.
// A rules-only design was possible — `allow create: if !exists(...)` is
// atomic — but it cannot express the part that actually matters: claiming
// the new key, releasing the OLD one, and updating users/{uid} have to
// happen together or the collection drifts out of step with the profiles
// it is supposed to describe. One transaction on the Admin SDK can do
// that; three independent client writes policed by three rules cannot.
//
// ── THE KEY IS DELIBERATELY LOSSIER THAN THE NAME ────────────────────────
//
// Display keeps the case and spacing you typed. The KEY lowercases and
// folds every run of space/underscore/period into a single hyphen, so
// "Big Tole", "big tole", "big_tole" and "Big-Tole" are one name. That is
// the point: a social app where two accounts are distinguishable only by
// an underscore has not solved impersonation, it has moved it.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { requireAppAdmin } = require('./appAdmin');
const { mirrorDisplayName } = require('./publicName');
const { liveUidsOf } = require('./liveUsers');
const { enforceRateLimit } = require('./guards');

const MIN_LEN = 2;
const MAX_LEN = 20;
// Letters and digits from any script (so a Hebrew name is a name), plus
// the separators a real display name uses. Deliberately no slash, which
// would break the document path, and no control or format characters.
const ALLOWED_NAME = /^[\p{L}\p{N} _.'-]+$/u;
// Firestore reserves ids matching __.*__ and the two relative-path ids.
const RESERVED_KEYS = new Set(['.', '..']);
// How many "name2", "name3" … to try before giving up and going random.
// Only ever reached at signup, where failing is not an option (see
// claimAtSignup).
const SUFFIX_TRIES = 9;

// What gets STORED and shown: trimmed, and internal whitespace collapsed
// so "Big    Tole" cannot masquerade as a different account from
// "Big Tole" by being wider.
function normalizeDisplay(raw) {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
}

// What gets COMPARED. See the header: case- and separator-insensitive.
function usernameKey(display) {
  return display
    .toLowerCase()
    .replace(/[\s_.]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Throws HttpsError with a message written for the person typing, not for
// a log. Returns the key, since every caller needs it next.
function validatedKey(display) {
  if (display.length < MIN_LEN) {
    throw new HttpsError('invalid-argument', `Names need at least ${MIN_LEN} characters.`);
  }
  if (display.length > MAX_LEN) {
    throw new HttpsError('invalid-argument', `Names can be at most ${MAX_LEN} characters.`);
  }
  if (!ALLOWED_NAME.test(display)) {
    throw new HttpsError('invalid-argument', "Use letters, numbers, spaces, and - _ . ' only.");
  }
  const key = usernameKey(display);
  // Everything the name was made of folded away — "___", "...", "- -".
  if (!key) throw new HttpsError('invalid-argument', 'Pick a name with letters or numbers in it.');
  if (RESERVED_KEYS.has(key) || /^__.*__$/.test(key)) {
    throw new HttpsError('invalid-argument', 'That name is not available.');
  }
  return key;
}

// The core. One transaction: prove the key is free (or already ours),
// take it, release the old one, and update the profile — together, so
// there is no window in which a name is reserved by nobody or by two.
//
// `force` is for the admin path only and skips the one-change-per-account
// limit. A user being TOLD to rename (mustChangeUsername) also skips it,
// because a forced rename that the one-change rule can refuse is a
// permanent lockout — and that is exactly the account most likely to have
// spent its change already.
async function claimFor(uid, rawName, { force = false } = {}) {
  const db = getFirestore();
  const display = normalizeDisplay(rawName);
  const key = validatedKey(display);

  const userRef = db.collection('users').doc(uid);
  const newRef = db.collection('usernames').doc(key);

  const outcome = await db.runTransaction(async (tx) => {
    // EVERY READ FIRST. Firestore forbids a read after a write in a
    // transaction, and the old key is not known until the profile is
    // read — so the reads are sequential, but they are all reads.
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new HttpsError('failed-precondition', 'Your profile has not been created yet.');
    }
    const user = userSnap.data();
    const currentDisplay = typeof user.displayName === 'string' ? normalizeDisplay(user.displayName) : '';
    const currentKey = currentDisplay ? usernameKey(currentDisplay) : '';
    const sameKey = currentKey === key;

    const claimSnap = await tx.get(newRef);
    if (claimSnap.exists && claimSnap.data()?.uid !== uid) {
      throw new HttpsError('already-exists', `“${display}” is taken — try another.`);
    }

    const oldRef = currentKey && currentKey !== key ? db.collection('usernames').doc(currentKey) : null;
    const oldSnap = oldRef ? await tx.get(oldRef) : null;

    const mustChange = user.mustChangeUsername === true;
    const isRename = Boolean(currentKey) && !sameKey;

    if (isRename && !force && !mustChange && user.usernameChangedOnce === true) {
      throw new HttpsError('failed-precondition', "You've already used your one name change.");
    }
    // Being told to rename and re-submitting the same name is not a
    // rename. Caught here rather than client-side because the client is
    // where the modal lives, and a modal that can be satisfied by its own
    // default value is not a forced anything.
    if (sameKey && mustChange) {
      throw new HttpsError('invalid-argument', 'Choose a different name from your current one.');
    }

    // ── WRITES ────────────────────────────────────────────────────────
    tx.set(newRef, { uid, displayName: display, claimedAt: new Date().toISOString() });
    // Only release a key that is provably ours. A stale currentKey whose
    // document belongs to someone else is somebody else's name, and
    // deleting it would hand this account a way to free any name it could
    // get written into its own profile.
    if (oldRef && oldSnap?.exists && oldSnap.data()?.uid === uid) tx.delete(oldRef);

    tx.update(userRef, {
      displayName: display,
      // A first claim is not a change — an account that reserves the name
      // it signed up with must not have burned its one rename doing it.
      ...(isRename ? { usernameChangedOnce: true } : {}),
      mustChangeUsername: false,
    });

    return { display, key, renamed: isRename, wasForced: mustChange };
  });

  // Outside the transaction, and best effort: the name is already unique
  // and correct on users/{uid} at this point. The copies on public/summary,
  // friendCodes and every past feed post are a consistency chore, and one
  // that must not be able to roll back a committed rename.
  let mirrored = null;
  try {
    mirrored = await mirrorDisplayName(uid, outcome.display);
  } catch {
    mirrored = null;
  }

  return { ...outcome, postsRenamed: mirrored?.postsRenamed ?? null };
}

// "Reef" + 3 -> "Reef3", trimmed so the suffix always fits in MAX_LEN
// rather than pushing the name over it.
function suffixed(base, n) {
  const tail = String(n);
  return `${base.slice(0, MAX_LEN - tail.length).trimEnd()}${tail}`;
}

// The signup claim. NEVER THROWS, and that is the whole design.
//
// By the time this runs the Auth account exists, users/{uid} is written
// and the sign-up form has unmounted — so an exception here has nowhere
// to render and would abort the rest of onboarding, which is precisely
// the live bug onboarding.js's header is the post-mortem of. A taken name
// therefore does not fail the signup; it gets a number ("Reef", "Reef2",
// "Reef3"), and the caller is told what the account ended up being called.
//
// If even that cannot be made to work — an unusable name, a profile that
// vanished — the account simply keeps an unreserved name and the next
// backfillUsernames run or their own rename picks it up. A signup that
// completes with an unclaimed name is a small problem; a signup that dies
// halfway is a large one.
async function claimAtSignup(uid, rawName) {
  const base = normalizeDisplay(rawName);
  if (!base) return { displayName: null, suffixed: false, reason: 'no name given' };

  for (let n = 0; n <= SUFFIX_TRIES; n += 1) {
    const candidate = n === 0 ? base : suffixed(base, n + 1);
    try {
      // force: reserving the name you signed up with is not a rename, and
      // must not spend the one change the account is entitled to.
      const res = await claimFor(uid, candidate, { force: true });
      return { displayName: res.display, suffixed: n > 0, reason: null };
    } catch (err) {
      // Anything other than "taken" will not be fixed by another suffix.
      if (err?.code !== 'already-exists') {
        return { displayName: null, suffixed: false, reason: err?.message ?? 'claim failed' };
      }
    }
  }
  return { displayName: null, suffixed: false, reason: 'too many similar names' };
}

exports.claimAtSignup = claimAtSignup;

// ── The user-facing rename ───────────────────────────────────────────────
exports.claimUsername = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  // The one-change rule is the real bound here; this only stops a script
  // burning reads by re-submitting the name it already has. Admin-exempt
  // like every other cap (functions/guards.js).
  await enforceRateLimit(uid, 'usernameClaim');
  const result = await claimFor(uid, request.data?.displayName);
  return { displayName: result.display, renamed: result.renamed, postsRenamed: result.postsRenamed };
});

// ── Availability, for typing into a box ──────────────────────────────────
//
// A courtesy, never a gate: the answer is stale the moment it is given,
// and claimUsername's transaction is what actually decides. Read-only.
exports.checkUsernameAvailable = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const display = normalizeDisplay(request.data?.displayName);
  let key;
  try {
    key = validatedKey(display);
  } catch (err) {
    return { available: false, reason: err.message };
  }
  const snap = await getFirestore().collection('usernames').doc(key).get();
  const takenByOther = snap.exists && snap.data()?.uid !== request.auth.uid;
  return { available: !takenByOther, reason: takenByOther ? `“${display}” is taken — try another.` : null };
});

// ── Admin: make a specific account rename itself ─────────────────────────
//
// A FLAG on the user document, not an email compared in app source. The
// brief offered either; a flag wins on every axis that matters — it works
// for the next account too, it does not ship somebody's personal address
// in a client bundle any signed-in user can read, and it cannot silently
// stop matching when that person changes their email.
exports.requireUsernameChange = onCall(async (request) => {
  await requireAppAdmin(request);
  const { email, uid: rawUid, clear = false } = request.data ?? {};

  let uid = typeof rawUid === 'string' && rawUid ? rawUid : null;
  if (!uid) {
    if (typeof email !== 'string' || !email.trim()) {
      throw new HttpsError('invalid-argument', 'Pass an email or a uid.');
    }
    try {
      uid = (await getAuth().getUserByEmail(email.trim())).uid;
    } catch {
      throw new HttpsError('not-found', `No account with the email ${email}.`);
    }
  }

  const userRef = getFirestore().collection('users').doc(uid);
  if (!(await userRef.get()).exists) {
    throw new HttpsError('not-found', 'That account has no profile document.');
  }
  await userRef.update({ mustChangeUsername: clear !== true });
  return { uid, mustChangeUsername: clear !== true };
});

// ── Admin: reserve the names that already exist ──────────────────────────
//
// Uniqueness that starts today protects nobody from the duplicates that
// are already in the database, so every live account's current name is
// claimed here. ORPHANS ARE SKIPPED for the same reason the friend
// backfill skips them (see liveUsers.js): a deleted account should not be
// holding a name that a real person could be using.
//
// COLLISIONS ARE REPORTED, NOT RESOLVED. If two live accounts already
// share a name, the first one wins the key and the second is listed in
// `collisions` — renaming somebody without asking is not a migration's
// call to make. The answer for those is requireUsernameChange, which is
// exactly what it is for.
//
// Idempotent: re-running re-claims each account's own key, which is a
// no-op write.
exports.backfillUsernames = onCall(async (request) => {
  await requireAppAdmin(request);
  const db = getFirestore();

  const usersSnap = await db.collection('users').select('displayName').get();
  const live = await liveUidsOf(usersSnap.docs.map((d) => d.id));

  const claimed = [];
  const collisions = [];
  const invalid = [];
  let skippedOrphans = 0;

  for (const doc of usersSnap.docs) {
    if (!live.has(doc.id)) {
      skippedOrphans += 1;
      continue;
    }
    const display = normalizeDisplay(doc.data()?.displayName);
    if (!display) {
      invalid.push({ uid: doc.id, reason: 'no display name' });
      continue;
    }
    try {
      // force: the one-change limit is about a user spending a rename,
      // and reserving the name they already have spends nothing.
      const res = await claimFor(doc.id, display, { force: true });
      claimed.push({ uid: doc.id, displayName: res.display, key: res.key });
    } catch (err) {
      const row = { uid: doc.id, displayName: display, reason: err?.message ?? 'failed' };
      if (err?.code === 'already-exists') collisions.push(row);
      else invalid.push(row);
    }
  }

  return {
    ran: true,
    claimed: claimed.length,
    collisions,
    invalid,
    skippedOrphans,
    userDocs: usersSnap.size,
  };
});

// Exported for the test harness and for onboarding.js's signup claim.
exports._internals = { normalizeDisplay, usernameKey, validatedKey, claimFor, claimAtSignup, suffixed, SUFFIX_TRIES, MAX_LEN };
