import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

// Config comes from .env.local (see .env.example) — set those from your
// Firebase project's web app config before any auth/database call will work.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  // Push notifications only — everything else above works without it, so
  // this is allowed to be missing (see lib/messaging.js's guard).
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

// True once real config is present — lets the UI show a clear setup screen
// instead of a wall of cryptic Firebase errors when .env.local isn't filled
// in yet.
export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

const app = firebaseConfigured ? initializeApp(firebaseConfig) : null;

// App Check — attests a request actually comes from THIS web app, not a
// script replaying the (public) Firebase config plus an instrumented or
// stolen ID token. It's the missing piece that stops a signed-in user from
// automating their own account against the callables/Firestore directly.
//
// Deliberately inert until VITE_FIREBASE_APPCHECK_SITE_KEY is set (a
// reCAPTCHA v3 site key — Firebase Console → App Check → register this web
// app with the reCAPTCHA v3 provider), so the app keeps running unchanged
// until that's provisioned. Turning it ON is two steps, in this order:
//   1. set the env var here + on Vercel, deploy — clients start attaching
//      tokens, but nothing is rejected yet (monitor the "unverified
//      requests" graph in the console for a few days to catch anything
//      legitimate that isn't sending one);
//   2. flip Firestore + Cloud Functions to "Enforced" in the console.
// Local dev / Vercel previews need a debug token: run
// `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` once in the browser console,
// reload, then register the token it logs under App Check → Debug tokens.
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;
if (app && appCheckSiteKey) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    // A bad key or a double-init must not take the whole app down — the
    // failure mode with enforcement on (backend rejects the calls) is
    // loud and obvious enough to debug from there.
  }
}

export const auth = app ? getAuth(app) : null;

// Offline-first Firestore. Gyms are basements — cell signal drops between
// sets, and without a local cache the history list, leaderboard, friends
// and shop all render empty the moment the connection blinks (the active
// workout itself is already safe: it lives in localStorage, see
// hooks/useWorkouts.js). persistentLocalCache keeps the last-read data on
// disk (IndexedDB) so those screens stay populated offline and writes
// queue until the connection returns. persistentMultipleTabManager lets
// two tabs share one cache instead of the old single-tab lock that made
// the second tab throw. Falls back to the plain in-memory Firestore if
// persistence can't initialise (private browsing with IndexedDB blocked,
// mainly) rather than leaving the app with no database at all.
function initDb(firebaseApp) {
  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(firebaseApp);
  }
}

export const db = app ? initDb(app) : null;
// logWorkout()/purchaseItem() (see hooks/useEconomy.js) — default region
// (us-central1) matches the plain `onCall(...)` in functions/economy.js
// with no region override, so the two sides line up without either
// specifying one explicitly.
export const functions = app ? getFunctions(app) : null;

// Push notifications (weekly weigh-in reminders, trainer weigh-in
// updates) — guarded three ways: no app, no browser support (isSupported()
// is async and resolves false in non-HTTPS contexts, older Safari, etc.),
// or a thrown init (belt-and-suspenders).
//
// `getMessagingInstance()` (not a plain `messaging` export) is deliberate:
// an earlier version exported a `let messaging` filled in by a fire-and-
// forget `isSupported().then(...)` at module load — a real race condition
// where tapping "Enable push notifications" before that promise settled
// saw `messaging` still `null` and failed silently, no matter how fast the
// check actually was. This version awaits the SAME promise every call
// (cached after the first resolution, so repeat calls are free) instead of
// trusting a variable that might not have been written yet.
//
// The `firebase/messaging` entrypoint (~30KB) is loaded with a dynamic
// import here rather than a static one at the top of the file: it pulls
// in only when something actually asks for push (the Settings toggle or
// the one-time prompt — see lib/messaging.js, itself a lazy chunk), so it
// no longer rides along in the initial bundle every visitor downloads
// before the login screen.
let readyPromise = null;
export function getMessagingInstance() {
  if (!app) return Promise.resolve(null);
  if (!readyPromise) {
    readyPromise = import('firebase/messaging')
      .then(({ isSupported, getMessaging }) =>
        isSupported().then((supported) => (supported ? getMessaging(app) : null)),
      )
      .catch(() => null);
  }
  return readyPromise;
}
