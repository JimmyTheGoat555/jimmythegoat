#!/usr/bin/env node
// Sets one account's coin balance directly, as the project owner, for
// testing the store. Local admin tooling — never deployed, never callable
// from the app.
//
//   NODE_PATH=functions/node_modules node tools/admin-set-coins.cjs \
//       --email=jimmythegoat.app@gmail.com --coins=100000
//
// Credentials come from Application Default Credentials, the standard
// Google mechanism (GOOGLE_APPLICATION_CREDENTIALS pointing at a service
// account key, or `gcloud auth application-default login`). The script
// never reads, prints or stores a credential itself; if none is
// available it says so and exits without touching anything.
//
// It writes exactly one field on users/{uid}: `coins`. Nothing else in the
// economy (meta/economy, rate limits, lifetime volume, unlocked lists) is
// touched, and the Admin SDK bypasses firestore.rules by design — this is
// the one path that may write a balance the server did not earn, and it
// exists only for the owner's own test accounts.

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);
const email = args.email;
const coins = Number(args.coins);
const projectId = args.project || process.env.GCLOUD_PROJECT || 'jimmy-the-goat';

if (!email || !Number.isInteger(coins) || coins < 0) {
  console.error('usage: node tools/admin-set-coins.cjs --email=<account email> --coins=<integer ≥ 0> [--project=jimmy-the-goat]');
  process.exit(2);
}

async function main() {
  initializeApp({ credential: applicationDefault(), projectId });
  const auth = getAuth();
  const db = getFirestore();

  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (err) {
    console.error(`could not resolve ${email}: ${err.message}`);
    process.exit(1);
  }
  const ref = db.collection('users').doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`users/${user.uid} does not exist — the account has not completed onboarding`);
    process.exit(1);
  }
  const before = Number(snap.get('coins')) || 0;
  await ref.update({ coins });
  const after = Number((await ref.get()).get('coins')) || 0;
  console.log(`${email} (uid ${user.uid}): coins ${before} → ${after}`);
}

main().catch((err) => {
  // A missing credential surfaces here as a "Could not load the default
  // credentials" error from google-auth-library.
  console.error(err.message);
  process.exit(1);
});
