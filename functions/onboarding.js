// The one write path for `users/{uid}/meta/profile`'s onboarding fields —
// pulled OFF the client and onto the Admin SDK after a real, live-
// diagnosed signup bug that silently dropped every new account's body
// weight and height.
//
// What actually went wrong (worth keeping, because the symptom pointed
// everywhere except the cause): signUp() wrote users/{uid}, whose
// friendCode field immediately woke useAuth.js's friendCode self-heal
// effect — the offline cache applies a local write instantly, so that
// effect ran and CREATED friendCodes/{code} before signUp()'s own write
// of the same doc, a few lines later, got there. The second write landed
// as an UPDATE against `allow update: if false`, threw permission-denied,
// and aborted the rest of signUp() — including the meta/profile write —
// with no visible error, because by then the account existed, the app had
// already switched away from the sign-up form, and the rejection had
// nowhere left to render. From the outside: a normal-looking signup, an
// empty profile, and a full workout rejected at the finish line.
//
// Running it here means the write can't be lost to a rules edge case or a
// client-side race at all — same reasoning every other must-actually-
// happen write in this app (coins, PRs, referral credit) is a callable.
// The ordering fix in useAuth.js and the friendCodes update rule in
// firestore.rules close the other two halves.
const { randomUUID } = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { friendWithOfficialAccount } = require('./officialAccount');

// Body weight is REQUIRED, not optional — logWorkout scores every set by
// strength-to-bodyweight, so an account with none on file can log a full
// workout and have it rejected at the very end with nothing to show for
// it (the exact incident this callable exists to close off). Height/goal/
// target stay optional, matching OnboardingFlow's own required-vs-not
// split.
exports.completeOnboardingProfile = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const { weightKg, heightCm, primaryGoal, targetDaysPerWeek, displayName } = request.data ?? {};

  const kg = Number(weightKg);
  if (!Number.isFinite(kg) || kg <= 0) {
    throw new HttpsError('invalid-argument', 'A valid body weight is required to finish creating your account.');
  }

  const db = getFirestore();
  const profileRef = db.collection('users').doc(uid).collection('meta').doc('profile');

  const profileDoc = {
    name: typeof displayName === 'string' ? displayName : '',
    bodyWeightLog: [
      {
        id: randomUUID(),
        date: new Date().toISOString(),
        weight: Math.round(kg * 10) / 10,
        visibility: 'private',
      },
    ],
  };
  const heightNum = Number(heightCm);
  if (Number.isFinite(heightNum) && heightNum > 0) profileDoc.heightCm = heightNum;
  if (primaryGoal) profileDoc.fitnessGoal = primaryGoal;
  const targetNum = Number(targetDaysPerWeek);
  if (Number.isFinite(targetNum) && targetNum > 0) profileDoc.weeklyTarget = targetNum;

  await profileRef.set(profileDoc, { merge: true });

  // The Admin SDK write above already went straight to the server (no
  // client-side persistence layer in between) — but read it back anyway,
  // since "trust the write, it should have worked" is the exact reasoning
  // that missed this bug the first time. Cheap insurance, one extra read.
  const verifySnap = await profileRef.get();
  if (!verifySnap.data()?.bodyWeightLog?.length) {
    throw new HttpsError('internal', "Couldn't save your body weight — please try again.");
  }

  // Everyone starts out friends with Jimmy, so nobody's first look at the
  // Social tab is an empty feed and an empty leaderboard. Deliberately
  // LAST and deliberately swallowed: the body weight above is the part
  // that must not fail (a workout cannot be scored without it), and a
  // missing welcome friendship is worth nothing next to a signup that
  // rolls back. See officialAccount.js.
  const friendedOfficial = await friendWithOfficialAccount(uid).catch(() => false);

  return { ok: true, friendedOfficial };
});
