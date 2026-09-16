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
const logger = require('firebase-functions/logger');
const { claimAtSignup } = require('./usernames');
const { MASCOT_IDS, resolveMascotId } = require('./mascots');

// Body weight is REQUIRED, not optional — logWorkout scores every set by
// strength-to-bodyweight, so an account with none on file can log a full
// workout and have it rejected at the very end with nothing to show for
// it (the exact incident this callable exists to close off). Height/goal/
// target stay optional, matching OnboardingFlow's own required-vs-not
// split.
exports.completeOnboardingProfile = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const { weightKg, heightCm, primaryGoal, targetDaysPerWeek, displayName, gender } = request.data ?? {};

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

  // The welcome friendship with Jimmy used to be claimed here. It moved to
  // claimWelcomeFriend (functions/welcomeFriend.js), which the app calls
  // once the email is actually verified: at THIS point in the flow nobody
  // is verified yet, and the app is hard-gated on that, so friending here
  // would fill the official account's friends list with people who never
  // came back — and its feed can only read 30 of them.

  // Mascot, written with the Admin SDK as a backstop for the client's own
  // users/{uid} write in signUp(). Both write the same value, and this one
  // is a merge, so running after the client's is a no-op in the normal
  // case — the point is the abnormal one this whole callable exists for
  // (see the header note: a client write to users/{uid} lost to a rules
  // race, silently). Which character you are is the most visible field on
  // the account, so it should not be the last one still depending on that
  // path.
  //
  // Derived here rather than trusted from the request: the client sends
  // the raw `gender` answer and the server decides what it means, so the
  // two sides cannot drift and a hand-crafted call cannot post an
  // arbitrary mascot id. The result is validated anyway before it is
  // written, since it lands in a field firestore.rules pins to a fixed
  // list and is snapshotted onto every feed post from here on.
  //
  // Never fatal. The body weight above is the one write in this flow
  // allowed to fail the call — a missing mascot costs a sprite, and
  // resolveMascotId falls back to the gender on the user doc anyway.
  const mascot = resolveMascotId({ gender });
  if (MASCOT_IDS.includes(mascot)) {
    try {
      await db.collection('users').doc(uid).set({ mascot }, { merge: true });
    } catch (err) {
      logger.warn('completeOnboardingProfile: could not write mascot', { uid, mascot, err });
    }
  }

  // Reserve the display name, so uniqueness starts at signup rather than
  // at the first rename. This is the right place for it and the ordering
  // is not incidental: signUp() awaits its users/{uid} write before
  // calling this, so the profile document claimAtSignup needs is already
  // there — and this runs AFTER the body weight above, which is the one
  // write in this flow that is allowed to fail the call.
  //
  // Never throws (see claimAtSignup): a name already in use gets a number
  // rather than killing a signup whose Auth account already exists. The
  // final name comes back so the caller can tell the user if it changed
  // out from under them.
  const claim = await claimAtSignup(uid, displayName);

  return { ok: true, displayName: claim.displayName, nameAdjusted: claim.suffixed };
});
