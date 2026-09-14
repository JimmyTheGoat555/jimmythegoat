// Firebase Auth error codes, in words a person can act on.
//
// The raw strings are not user-facing text: `err.message` arrives as
// "Firebase: Error (auth/user-not-found)." — a prefix, a parenthesis and
// an internal code, which the sign-in form used to print after stripping
// only the word "Firebase:". This maps the codes people actually hit and
// falls back to the cleaned string for the ones they do not.
//
// ONE NOTE THAT MATTERS FOR PASSWORD RESET: with Firebase's email
// enumeration protection on — the default for projects created since
// 2023 — sendPasswordResetEmail RESOLVES for an address that has no
// account. 'auth/user-not-found' never arrives, by design, so that the
// form cannot be used to discover who has an account. The honest
// consequence is that "we sent you a link" can never mean "your address
// is real", which is exactly why the verification banner exists.
const MESSAGES = {
  'auth/invalid-email': "That doesn't look like a valid email address.",
  'auth/missing-email': 'Enter your email address first.',
  'auth/user-not-found': "No account with that email — check the spelling, or sign up.",
  'auth/wrong-password': 'Wrong password — try again, or reset it below.',
  'auth/invalid-credential': "That email and password don't match an account.",
  'auth/invalid-login-credentials': "That email and password don't match an account.",
  'auth/email-already-in-use': 'That email already has an account — sign in instead.',
  'auth/weak-password': 'Password needs to be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'No connection — check your signal and try again.',
  'auth/user-disabled': 'That account has been disabled.',
  // Changing an email is a "recent login" operation: Firebase refuses it
  // on a session that has been open for a while, and the only fix is a
  // fresh sign-in. Said as an instruction, since the button that triggers
  // this is one line above a sign-out link.
  'auth/requires-recent-login': 'For security, sign out and back in first — then change your email.',
  'auth/operation-not-allowed': 'That sign-in method is turned off for this app.',
};

export function friendlyAuthError(err, fallback = 'Something went wrong — try again.') {
  const code = err?.code;
  if (code && MESSAGES[code]) return MESSAGES[code];
  const raw = typeof err?.message === 'string' ? err.message : '';
  const cleaned = raw
    .replace(/^Firebase:\s*/, '')
    .replace(/\s*\(auth\/[^)]+\)\.?/, '')
    // Callable errors arrive with the HTTP status bolted on the end —
    // "…come back tomorrow. [429]" — which is debugging output wearing a
    // sentence's clothes. It reaches ordinary UI states now (the once-a-day
    // ad cap is a [429] every time), so it goes here rather than at one
    // call site.
    .replace(/\s*\[\d{3}\]\s*$/, '')
    .trim();
  return cleaned || fallback;
}
