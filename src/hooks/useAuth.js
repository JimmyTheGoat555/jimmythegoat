import { useCallback, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, firebaseConfigured, functions } from '../lib/firebase';

// Short, human-typeable code — used for both a trainer's trainerCode (a
// trainee enters it once at signup) and now every account's friendCode
// (anyone can be followed by one — see useFriendsGraph.js). Collisions are
// astronomically unlikely at this scale; not worth a uniqueness round-trip
// for a first pass.
function randomShareCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Single source of truth for "who is signed in and what's their role."
// Instantiated once in App.jsx (same anti-desync rule every other shared
// hook in this app follows) and passed down as props.
export function useAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [authError, setAuthError] = useState(null);
  // Set only if the profile doc listener itself fails (permission-denied,
  // offline, etc) — separate from authError so App.jsx can tell "still
  // loading" apart from "loading broke" and show a real way out instead of
  // a blank screen forever. See the `if (!account)` guard in App.jsx.
  const [profileError, setProfileError] = useState(null);

  // Auth state → who's signed in.
  useEffect(() => {
    if (!firebaseConfigured) {
      setInitializing(false);
      return;
    }
    return onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setInitializing(false);
      if (!firebaseUser) setProfile(null);
    });
  }, []);

  // Profile doc → role, trainerCode/trainerId. Lives separately from the
  // auth user object and updates live (e.g. a trainee's trainerId changing).
  useEffect(() => {
    if (!user) return;
    setProfileError(null);
    return onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      },
      // Without this, a failure here (permission-denied, offline, whatever)
      // left `profile` stuck at null forever with nothing logged anywhere
      // the user could see — and since App.jsx renders blank until the
      // profile loads, that reads as the entire app silently dying. Real
      // bug, found live: see the signUp() rewrite below for how a user
      // could actually end up here.
      (err) => setProfileError(err.message),
    );
  }, [user]);

  // Self-heals any trainer account created before the trainerCodes/{code}
  // lookup table existed (see firestore.rules) — without this, an
  // established trainer's own code would resolve for everyone who signed
  // up AFTER this fix shipped, but stay permanently broken for their
  // existing trainees/new signups because nothing ever backfilled their
  // entry. Idempotent (setDoc + merge) and cheap enough to just run
  // whenever this trainer's own profile loads, no separate migration script
  // needed.
  useEffect(() => {
    if (!user || profile?.role !== 'trainer' || !profile?.trainerCode) return;
    setDoc(doc(db, 'trainerCodes', profile.trainerCode), { trainerId: user.uid }, { merge: true }).catch(() => {
      // Best-effort — if this fails, the trainer just can't be looked up by
      // code yet; nothing else in the app depends on this write succeeding.
    });
  }, [user, profile?.role, profile?.trainerCode]);

  // Same self-heal, for every account's friendCode/friendCodes entry —
  // added later than trainerCode was, so any account created before this
  // pass has neither a friendCode field nor a friendCodes lookup entry yet.
  useEffect(() => {
    if (!user || !profile) return;
    if (profile.friendCode) {
      setDoc(
        doc(db, 'friendCodes', profile.friendCode),
        { uid: user.uid, displayName: profile.displayName ?? 'Someone' },
        { merge: true },
      ).catch(() => {});
    } else {
      // Pre-friendCode account: mint one now and attach it, same as a
      // fresh signup would have.
      const code = randomShareCode();
      setDoc(doc(db, 'users', user.uid), { friendCode: code }, { merge: true })
        .then(() => setDoc(doc(db, 'friendCodes', code), { uid: user.uid, displayName: profile.displayName ?? 'Someone' }))
        .catch(() => {});
    }
  }, [user, profile, profile?.friendCode, profile?.displayName]);

  // The other half of nudge-push suppression (see functions/index.js's
  // sendPushOnNotificationCreate): flips hasUnreadNudgePush back to false
  // the moment this person is actually looking at the app again, which is
  // what makes the NEXT nudge eligible to push instead of just queuing
  // silently. Runs on mount/profile-load (covers a cold open after a nudge
  // arrived while the app was closed) and again on every tab/PWA
  // foreground — not just once — since the flag can flip true again at any
  // point while they're away.
  useEffect(() => {
    if (!user || !profile?.hasUnreadNudgePush) return;
    const reset = () => {
      if (document.visibilityState !== 'visible') return;
      updateDoc(doc(db, 'users', user.uid), { hasUnreadNudgePush: false }).catch(() => {});
    };
    reset();
    document.addEventListener('visibilitychange', reset);
    return () => document.removeEventListener('visibilitychange', reset);
  }, [user, profile?.hasUnreadNudgePush]);

  const signUp = useCallback(async ({ email, password, displayName, role, trainerCode, referralCode, onboarding }) => {
    setAuthError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });

      // The one and only place a verification email is sent — right here at
      // sign-up. Best-effort, exactly like the trainer-code lookup below:
      // the account already exists and this person is already signed in, so
      // a failure to send (rate limit, transient network) must not take
      // down a signup that otherwise succeeded. Verification is not a gate
      // in the app; the server-side outbound-social guards
      // (functions/guards.js) are what actually require a confirmed address.
      sendEmailVerification(cred.user).catch(() => {});

      // Resolving the trainer code is best-effort, NOT a precondition for
      // finishing signup — createUserWithEmailAndPassword above already
      // signed this person in (Firebase Auth fires onAuthStateChanged the
      // instant the account exists), so if this step threw and the setDoc
      // below never ran, the user would be left signed in with no Firestore
      // profile doc at all. App.jsx has nothing to render for that (it
      // blanks the screen until the profile loads) and there's no way back
      // to the sign-up form once `user` is set — a real, live-reproduced
      // dead end. A wrong/unmatched code (or, formerly, a Firestore rule
      // that couldn't even run this lookup — see firestore.rules) now just
      // skips the connection instead of failing the whole account, exactly
      // matching what the sign-up form already tells people: "you can also
      // skip this and connect later from your profile."
      let trainerId = null;
      let trainerCodeWarning = null;
      if (role === 'trainee' && trainerCode) {
        try {
          // See firestore.rules' trainerCodes/{code} match for why this is
          // a plain get()-by-id against a dedicated lookup table rather
          // than a `where('trainerCode', ...)` query against `users` — the
          // latter can never be authorized for a not-yet-connected caller.
          const codeSnap = await getDoc(doc(db, 'trainerCodes', trainerCode.trim().toUpperCase()));
          if (!codeSnap.exists()) {
            trainerCodeWarning = 'That trainer code doesn\'t match any coach — you can connect later from your profile.';
          } else {
            trainerId = codeSnap.data().trainerId;
          }
        } catch {
          trainerCodeWarning = 'Couldn\'t connect to that trainer right now — you can try again later from your profile.';
        }
      }

      const ownTrainerCode = role === 'trainer' ? randomShareCode() : null;
      const ownFriendCode = randomShareCode(); // everyone gets one — see useFriendsGraph.js

      // Gamer-grade onboarding preferences (AuthScreen -> OnboardingFlow):
      // unit system, training experience, primary goal, routine style,
      // planned days/week. Stored on the user doc itself — firestore.rules'
      // users/{uid} create rule pins only coins/unlocks/friends/sharePRs to
      // their defaults and lets any other field ride along on this first
      // write. Body weight + height go to meta/profile instead (below),
      // beside the weigh-in log they belong with. Every field optional —
      // only what was actually chosen is written.
      const onboardingPrefs = {};
      if (onboarding) {
        const { unitSystem, experienceLevel, primaryGoal, routineStyle, targetDaysPerWeek, gender, birthday } =
          onboarding;
        if (unitSystem) onboardingPrefs.unitSystem = unitSystem;
        if (experienceLevel) onboardingPrefs.experienceLevel = experienceLevel;
        if (primaryGoal) onboardingPrefs.primaryGoal = primaryGoal;
        if (routineStyle) onboardingPrefs.routineStyle = routineStyle;
        if (targetDaysPerWeek) onboardingPrefs.targetDaysPerWeek = Number(targetDaysPerWeek);
        // Single-topic wizard screens (components/auth/OnboardingFlow.jsx).
        // `birthday` is a plain YYYY-MM-DD string.
        if (gender) onboardingPrefs.gender = gender;
        if (birthday) onboardingPrefs.birthday = birthday;
      }

      await setDoc(doc(db, 'users', cred.user.uid), {
        email,
        displayName,
        role,
        trainerCode: ownTrainerCode,
        trainerId,
        friendCode: ownFriendCode,
        friends: [],
        equippedDance: null,
        equippedAccessory: null,
        // Multi-slot loadout — see data/storeItems.js.
        equippedAccessories: [],
        createdAt: new Date().toISOString(),
        // Settings' one-time username change — see firestore.rules'
        // usernameChangeValid(), the actual enforcement (this is just the
        // starting value the rule checks against).
        usernameChangedOnce: false,
        // Coin economy starting state — see functions/economy.js and
        // firestore.rules' economyFieldsAtDefault(), which only ever
        // allows these three fields to be CREATED at exactly these values;
        // every change after this one has to go through logWorkout()/
        // purchaseItem() server-side.
        coins: 0,
        unlockedDances: [],
        unlockedAccessories: [],
        // Off by default: a friend's profile shows nothing about your
        // lifted weights until you opt in — see SettingsPanel's toggle and
        // functions/publicProfile.js's setSharePRs(), the only place this
        // ever changes after signup (also server-managed — see
        // firestore.rules' serverManagedFieldsUnchanged()).
        sharePRs: false,
        // Nudge-push suppression — see functions/index.js's
        // sendPushOnNotificationCreate and the reset effect below. Plain
        // owner-writable (not server-managed): this flag only ever affects
        // pushes TO its own owner, so there's nothing to gain by lying
        // about your own copy of it.
        hasUnreadNudgePush: false,
        ...onboardingPrefs,
      });

      // Onboarding's body stats -> meta/profile, FIRST of the post-account
      // writes and the only fatal one: logWorkout scores every set by
      // strength-to-bodyweight, so an account without it can log a whole
      // workout and have it rejected at the very end with nothing saved.
      //
      // A Cloud Function (functions/onboarding.js), not a client setDoc,
      // for the same reason every other must-actually-happen write in this
      // app (coins, PRs, referral credit) is one: the Admin SDK bypasses
      // firestore.rules and the offline cache, so this can't be lost to a
      // rules edge case or a sync race the way the client-side version was
      // — see the friendCodes note below for the race that actually broke
      // this, and firestore.rules' friendCodes block for the other half of
      // the fix.
      await httpsCallable(functions, 'completeOnboardingProfile')({
        displayName,
        weightKg: onboarding?.weightKg,
        heightCm: onboarding?.heightCm,
        primaryGoal: onboarding?.primaryGoal,
        targetDaysPerWeek: onboarding?.targetDaysPerWeek,
      });

      // Lookup-table entries, so a code is resolvable the moment the
      // account exists rather than whenever the self-heal effect above
      // next happens to run. Deliberately AFTER the profile call and
      // deliberately non-fatal: these are conveniences that the self-heal
      // effect already backfills on the very next profile load, whereas
      // the body weight above is load-bearing (logWorkout can't score a
      // single set without it). Running them first, fatally, is exactly
      // what broke signup — signUp()'s own friendCodes write raced the
      // self-heal effect, lost, landed as a rules-denied UPDATE, and took
      // the body-weight write down with it while the already-unmounted
      // sign-up form swallowed the error. Order and `.catch` here, plus
      // the matching friendCodes update rule in firestore.rules, mean
      // neither half of that race can break the other again.
      if (ownTrainerCode) {
        setDoc(doc(db, 'trainerCodes', ownTrainerCode), { trainerId: cred.user.uid }).catch(() => {});
      }
      setDoc(doc(db, 'friendCodes', ownFriendCode), { uid: cred.user.uid, displayName }, { merge: true }).catch(
        () => {},
      );

      // Referral bonus — credits the REFERRER, not this account, so it's
      // best-effort exactly like the trainer-code lookup above: a bad,
      // expired, or self-referred code must never fail a signup that
      // otherwise succeeded. See functions/referral.js for the actual
      // validation (self-referral, one-claim-per-account, a per-referrer
      // daily cap).
      if (referralCode && referralCode.trim()) {
        httpsCallable(functions, 'claimReferral')({ code: referralCode.trim() }).catch(() => {});
      }

      // Surfaced by AuthScreen as a one-line heads-up on the app itself
      // (the sign-up form is gone by the time this resolves — see above),
      // rather than as an error, since the account really did succeed.
      return { user: cred.user, warning: trainerCodeWarning };
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  }, []);

  const signIn = useCallback(async (email, password) => {
    setAuthError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return cred.user;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  }, []);

  // AuthScreen's "Forgot password?" — Firebase Auth owns the whole rest of
  // this flow (the emailed link goes to a Firebase-hosted reset page,
  // not anything in this app), so there's nothing else to build here.
  // Deliberately NOT routed through authError like signIn/signUp above:
  // AuthScreen shows this one in its own inline spot, not the main form's
  // error banner, so the two can never visually collide if both happened
  // to be set at once.
  const resetPassword = useCallback((email) => sendPasswordResetEmail(auth, email), []);

  // Erasing an account reaches into other people's documents (their friends
  // arrays, requests this person sent them) and has to remove the Firebase
  // Auth user itself, so all of it lives server-side — see
  // functions/account.js.
  //
  // The explicit sign-out is required, not tidiness: deleting the Auth user
  // server-side does NOT invalidate an ID token already minted for this
  // session, and onAuthStateChanged has nothing to fire on. Without this the
  // app sits there signed in as an account that no longer exists — every
  // read failing against rules — until the token happens to expire. Verified
  // live: the first run of this left exactly that zombie session on screen.
  const deleteAccount = useCallback(async () => {
    await httpsCallable(functions, 'deleteAccount')();
    await firebaseSignOut(auth);
  }, []);

  // Settings' "Share my PRs with friends" toggle. A callable, not a plain
  // owner update — see firestore.rules' serverManagedFieldsUnchanged() and
  // functions/publicProfile.js for why: this flag's whole point is an
  // immediate, real privacy consequence for users/{uid}/public/summary, and
  // a plain write here would leave that mirror stale until the next workout.
  const setSharePRs = useCallback(async (share) => {
    await httpsCallable(functions, 'setSharePRs')({ share });
  }, []);

  const signOutUser = useCallback(() => firebaseSignOut(auth), []);

  // Settings' username field — see firestore.rules' usernameChangeValid()
  // for the real one-time enforcement; the `account.usernameChangedOnce`
  // check in SettingsPanel is just so the UI can disable the field and
  // explain why BEFORE someone wastes their one shot on a doomed request.
  // Updates the Firestore doc (what the rest of the app actually reads —
  // ProfileView, feed posts, etc all show `account.displayName`) and, best-
  // effort, the Firebase Auth profile too for consistency; the Auth call
  // failing doesn't block anything since nothing else in this app reads it.
  const updateUsername = useCallback(
    async (newName) => {
      const trimmed = newName.trim();
      if (!trimmed) throw new Error('Enter a name.');
      await setDoc(doc(db, 'users', user.uid), { displayName: trimmed, usernameChangedOnce: true }, { merge: true });
      updateProfile(user, { displayName: trimmed }).catch(() => {});
    },
    [user],
  );

  // A trainee who skipped the trainer code at signup (or wants to switch
  // coaches) can redeem one later from their profile.
  const connectToTrainer = useCallback(
    async (code) => {
      // See the matching comment in signUp() — same trainerCodes/{code}
      // lookup table, same reason a `where('trainerCode', ...)` query
      // against `users` can't be authorized here.
      const codeSnap = await getDoc(doc(db, 'trainerCodes', code.trim().toUpperCase()));
      if (!codeSnap.exists()) throw new Error('No trainer found with that code.');
      await setDoc(doc(db, 'users', user.uid), { trainerId: codeSnap.data().trainerId }, { merge: true });
    },
    [user],
  );

  // Either side can end it; the function works out which one is calling and
  // clears the trainer's assignments along with the link — see
  // functions/coaching.js for why this can't be a plain client write.
  const disconnectFromTrainer = useCallback(async (traineeUid) => {
    await httpsCallable(functions, 'disconnectTrainer')(traineeUid ? { traineeUid } : {});
  }, []);

  // Tell the connected trainer about a fresh weigh-in. A callable, not a
  // direct write into their notifications subcollection: that used to be a
  // client write and let any account aim its own trainerId at a victim and
  // post arbitrary push text (see functions/coaching.js's notifyTrainer).
  // Best-effort — a weigh-in still saves locally even if the coach ping
  // fails.
  const notifyTrainer = useCallback(async ({ weight, deltaKg, achieved }) => {
    await httpsCallable(functions, 'notifyTrainer')({ weight, deltaKg, achieved });
  }, []);

  return {
    user,
    profile,
    initializing,
    authError,
    profileError,
    signUp,
    signIn,
    signOut: signOutUser,
    connectToTrainer,
    disconnectFromTrainer,
    notifyTrainer,
    updateUsername,
    resetPassword,
    deleteAccount,
    setSharePRs,
  };
}
