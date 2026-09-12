import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Routes, Route, Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import WorkoutHome from './components/workout/WorkoutHome';
import BottomNav from './components/layout/BottomNav';
import { TAB_PATHS, TRAINER_TAB_PATH } from './components/layout/tabPaths';
import AuthScreen from './components/auth/AuthScreen';
import FirebaseSetupNeeded from './components/auth/FirebaseSetupNeeded';
import TopHud from './components/layout/TopHud';
import { useCloudWorkoutHistory } from './hooks/useCloudWorkouts';
import { useCloudProfile } from './hooks/useCloudProfile';
import { useEconomy } from './hooks/useEconomy';
import { useActiveWorkout } from './hooks/useWorkouts';
import { useExercises } from './hooks/useExercises';
import { useFriendsGraph } from './hooks/useFriendsGraph';
import { useFeed } from './hooks/useFeed';
import { useAuth } from './hooks/useAuth';
import { useNotifications } from './hooks/useNotifications';
import { useTierUpCelebration } from './hooks/useTierUpCelebration';
import { useLazyGoatNudge } from './hooks/useLazyGoatNudge';
import { useAssignedWorkouts } from './hooks/useAssignedWorkouts';
import { useWorkoutTemplates } from './hooks/useWorkoutTemplates';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useTabSwipe } from './hooks/useTabSwipe';
import { firebaseConfigured } from './lib/firebase';
import { lifetimeVolume, lastWorkoutAt } from './utils/workoutStats';
import { getEvolutionProgress } from './utils/evolutionTiers';
import { findNewPersonalRecords } from './utils/personalRecords';
import { lastPerformance, seedSetsFromHistory } from './utils/lastPerformance';
import { isBodyweightExercise } from './data/exercises';
import { JimmyLookProvider } from './context/JimmyLook';
import { DEFAULT_SETS_PER_EXERCISE } from './hooks/useWorkouts';
import { getBadge } from './data/badges';
import { tierCssVars } from './utils/tierTheme';

// Everything past the first screen is split out of the initial bundle. The
// app shipped as one ~1.3MB chunk that every user parsed before seeing
// anything, even though most of it is screens they may never open —
// recharts alone (ProgressView's only consumer) is a large slice of it, and
// the trainer screens are dead weight for the trainees who are most of the
// user base. WorkoutHome stays eagerly imported: it is the landing screen,
// so lazying it would only add a round trip to first paint.
//
// The bottom tabs are lazy too, but prefetched on idle right after startup
// (see prefetchTabScreens) — swiping between tabs has to stay instant, and
// waiting for a chunk mid-swipe would be worse than the bundle we started
// with. Non-tab screens load on demand.
const ProgressView = lazy(() => import('./components/progress/ProgressView'));
const SocialPage = lazy(() => import('./components/social/SocialPage'));
const GymShop = lazy(() => import('./components/shop/GymShop'));
const ProfileView = lazy(() => import('./components/profile/ProfileView'));
const HistoryList = lazy(() => import('./components/history/HistoryList'));
const PublicFriendProfile = lazy(() => import('./components/social/PublicFriendProfile'));
const WorkoutDetail = lazy(() => import('./components/history/WorkoutDetail'));
const ActiveWorkoutLogger = lazy(() => import('./components/workout/ActiveWorkoutLogger'));
const TrainerDashboard = lazy(() => import('./components/trainer/TrainerDashboard'));
const TraineeDetail = lazy(() => import('./components/trainer/TraineeDetail'));
const TraineeWorkoutDetail = lazy(() => import('./components/trainer/TraineeWorkoutDetail'));
const AssignWorkoutForm = lazy(() => import('./components/trainer/AssignWorkoutForm'));
// Both are modals that render only once something opens them, and both pull
// in lib/messaging -> firebase/messaging, which otherwise sits in the
// startup bundle for the sake of a permission toggle most sessions never
// touch.
const NotificationPromptModal = lazy(() => import('./components/profile/NotificationPromptModal'));
const SettingsPanel = lazy(() => import('./components/profile/SettingsPanel'));
// A one-time, per-account overlay (the Silver Lootbox) — no reason to ship
// it in the startup bundle for the sessions that will never see it again.
const SilverLootboxModal = lazy(() => import('./components/workout/SilverLootboxModal'));
// The post-finish victory lap. Only ever mounts for the few seconds
// between a workout being logged and its reward landing.
const WorkoutSummaryChecklist = lazy(() => import('./components/workout/WorkoutSummaryChecklist'));

function prefetchTabScreens() {
  import('./components/progress/ProgressView');
  import('./components/social/SocialPage');
  import('./components/shop/GymShop');
}

// Holds the same vertical space the tab screens occupy, so a chunk that
// arrives a frame late doesn't collapse the layout and bounce the nav.
function ScreenFallback() {
  return <div className="min-h-[calc(100vh-12rem)]" aria-hidden="true" />;
}

// Shared chrome for every tab-bar screen; the active-workout screen below
// renders standalone since it has its own fixed footer (and no HUD/gear/
// swipe — mid-set is the wrong moment for any of them). A trainer gets a
// 5th "Trainees" tab; everyone else gets the plain 4 (Store included now
// — see BottomNav.jsx).
//
// Swiping left/right between tabs (useTabSwipe) and tapping a tab button
// (BottomNav's own NavLink `state`) both drive the SAME directional
// slide-in on whatever screen ends up on top — see index.css's
// .tab-enter-* keyframes. Deliberately scoped to ONLY the exact tab
// routes in getTabPaths(), not every route this Layout renders: a swipe
// or animated transition on Profile/History/a trainee's detail page etc.
// would imply those are part of the swipeable set when they aren't (and
// for Profile/History specifically, they're reached by a forward link,
// not a tab tap, so "which direction did I come from" isn't even a
// sensible question there).
function Layout({ isTrainer, tierId, coins, unreadNotifications, onOpenSettings }) {
  const location = useLocation();
  const containerRef = useRef(null);
  const tabPaths = isTrainer ? [...TAB_PATHS, TRAINER_TAB_PATH] : TAB_PATHS;
  useTabSwipe(tabPaths, containerRef);

  // React's own blessed pattern for "derive something from a value
  // changing, without an extra effect+render round trip" — comparing
  // against PREVIOUS render's pathname and calling setState conditionally
  // right here in the render body (not in an effect, and not a ref read
  // during render, which is its own real anti-pattern — see
  // react.dev/reference/react/useState#storing-information-from-previous-renders).
  // A conditional setState mid-render like this bails out and re-renders
  // immediately with the new values before anything paints, so there's no
  // flash of a stale enterClass.
  const [prevPathname, setPrevPathname] = useState(location.pathname);
  const [enterClass, setEnterClass] = useState(null);
  if (location.pathname !== prevPathname) {
    let nextClass = null;
    if (tabPaths.includes(prevPathname) && tabPaths.includes(location.pathname)) {
      // Prefer the explicit direction BottomNav/useTabSwipe already
      // computed; fall back to comparing tab order for any OTHER way this
      // transition could have happened (the browser's own back/forward
      // buttons moving between two tabs, say), so the fallback still
      // matches what a swipe/tap would have shown.
      const explicit = location.state?.navDirection;
      const direction =
        explicit ?? (tabPaths.indexOf(location.pathname) > tabPaths.indexOf(prevPathname) ? 'forward' : 'backward');
      nextClass = direction === 'forward' ? 'tab-enter-forward' : 'tab-enter-backward';
    }
    setPrevPathname(location.pathname);
    setEnterClass(nextClass);
  }

  return (
    <>
      <TopHud coins={coins} onOpenSettings={onOpenSettings} />
      <div ref={containerRef}>
        {enterClass ? (
          <div key={location.pathname} className={enterClass}>
            <Outlet />
          </div>
        ) : (
          <Outlet />
        )}
      </div>
      <BottomNav isTrainer={isTrainer} tierId={tierId} unreadNotifications={unreadNotifications} />
    </>
  );
}

// True when a failed callable (logWorkout) failed because the device is
// offline / can't reach the backend — as opposed to a real rejection the
// server sent back (a set out of bounds, the cooldown, today's cap). Only
// the offline case is safe to retry unchanged; a real error has to reach
// the user. `navigator.onLine === false` is the strongest signal; the code
// / message checks catch the "flaky connection, request never landed" case
// where the browser still thinks it's online.
function isOfflineError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const code = String(err?.code ?? '');
  // Deliberately NOT 'deadline-exceeded': a real server timeout might have
  // committed the transaction, and auto-retrying it would race the
  // cooldown check for a possibly-already-logged workout. A genuine
  // "no connection" surfaces as one of the below or navigator.onLine.
  if (code === 'functions/unavailable' || code === 'unavailable') {
    return true;
  }
  return /failed to fetch|network error|network request failed|internet connection|load failed/i.test(
    String(err?.message ?? ''),
  );
}

export default function App() {
  const navigate = useNavigate();
  const {
    user,
    profile: account,
    initializing,
    profileError,
    signUp,
    signIn,
    signOut,
    connectToTrainer,
    disconnectFromTrainer,
    notifyTrainer,
    updateUsername,
    resetPassword,
    emailVerified,
    resendVerification,
    refreshEmailVerified,
    deleteAccount,
    setSharePRs,
  } = useAuth();
  const uid = user?.uid ?? null;

  // A one-line dismissible banner for non-fatal heads-ups that need to
  // survive a component unmounting right as they happen — originally just
  // signUp()'s "that trainer code didn't match" warning (AuthScreen
  // unmounts the instant `user` is set below, before its own local state
  // would ever get a chance to paint), now also used for "+N coins
  // earned" after a workout — same shape, same reason it lives up here
  // instead of on whichever screen triggered it.
  const [appNotice, setAppNotice] = useState(null);
  // The Silver Lootbox — set once, ever, per account, the moment
  // logWorkout's response carries a firstWorkoutReward (see
  // handleFinishWorkout below). Rendered as its own full-screen overlay
  // rather than folded into appNotice's small toast — see
  // SilverLootboxModal.jsx.
  const [lootboxReward, setLootboxReward] = useState(null);
  // The checklist that plays after a workout is logged: { exercises, reward }.
  // `reward` is the deferred "what the user actually earned" step (coin/badge
  // toast, or the Silver Lootbox) — held back until the ticking finishes so
  // the two moments land in sequence instead of on top of each other.
  const [finishChecklist, setFinishChecklist] = useState(null);
  const handleSignUp = async (data) => {
    const { warning } = await signUp(data);
    if (warning) setAppNotice({ message: warning, tone: 'warning' });
  };

  // The gear icon in TopHud opens this — see SettingsPanel.jsx. Plain local
  // state (not a route) since it's an overlay reachable from every tab-bar
  // screen at once, not a destination of its own.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Without this, signing out FROM Settings (or from TrainerDashboard while
  // Settings happened to still be open underneath) left it open in
  // App's own state — invisible while signed out (the `!user` early return
  // below skips rendering it), but still `true` the instant the NEXT
  // sign-in resolves, popping Settings open uninvited for whoever just
  // signed into a different account on the same device. Found live, not
  // hypothetically: reproduced by opening Settings, signing out, and
  // signing into a second account.
  useEffect(() => {
    if (!user) setSettingsOpen(false);
  }, [user]);

  // Warm the other bottom tabs once the browser is otherwise idle, so the
  // swipe/tap between them never waits on a network round trip. Deliberately
  // after first paint rather than as part of it — that ordering is the whole
  // point of splitting them out.
  useEffect(() => {
    if (typeof requestIdleCallback !== 'function') {
      const timer = setTimeout(prefetchTabScreens, 2000);
      return () => clearTimeout(timer);
    }
    const handle = requestIdleCallback(prefetchTabScreens, { timeout: 4000 });
    return () => cancelIdleCallback(handle);
  }, []);

  // If the profile doc still hasn't loaded a while after signing in (and
  // hasn't outright errored — that's handled separately below), don't just
  // sit on a blank screen forever with no way out. This is a real bug that
  // happened live: see useAuth.js's signUp() for the original cause: an
  // account could exist in Firebase Auth with no matching Firestore doc,
  // and the app has nothing to render until that doc shows up.
  const [stuckLoading, setStuckLoading] = useState(false);
  useEffect(() => {
    if (!user || account) {
      setStuckLoading(false);
      return;
    }
    const timer = setTimeout(() => setStuckLoading(true), 8000);
    return () => clearTimeout(timer);
  }, [user, account]);

  // Every account — trainer or trainee — gets the exact same personal
  // tracking: their own workouts, exercises, evolution, leaderboard spot.
  // A trainer is a person who lifts too; managing trainees is an addition
  // on top, not a different app. All hooks stay unconditional (rules of
  // hooks) even before sign-in resolves — each is a no-op until `uid` exists.
  const exercises = useExercises(uid);
  const { workouts, deleteWorkout, updateWorkout } = useCloudWorkoutHistory(uid);
  // Lifted here (used to live only inside ProfileView) so SettingsPanel can
  // share the exact same live doc + updater for goals editing, rather than
  // opening a second onSnapshot listener on users/{uid}/meta/profile.
  const { profile, updateDetails, logBodyWeight, deleteBodyWeightEntry } = useCloudProfile(uid);
  // Coin economy — see hooks/useEconomy.js. Holds no state of its own;
  // `profile.coins`/`unlockedDances`/`unlockedAccessories` already arrive
  // live via useAuth's own profile listener the instant logWorkout()/
  // purchaseItem() update them server-side.
  const { logWorkout, purchaseItem, equipItem, setEquippedAccessories } = useEconomy(uid);
  // Social graph + feed — see hooks/useFriendsGraph.js and useFeed.js.
  // `account.friends` (bare uids) is the source of truth; both hooks derive
  // from it rather than holding their own copy.
  const friendUids = account?.friends ?? [];
  const friendsGraph = useFriendsGraph(uid, friendUids);
  const feed = useFeed(friendUids);
  // In-app notification inbox (weigh-in reminders, trainer weigh-in
  // updates, friend nudges). Lifted here from ProfileView so the unread
  // count can drive a badge on the Social tab in BottomNav — the inbox
  // itself renders on the Social tab now, not Profile (which is
  // stats-only). See hooks/useNotifications.js.
  const {
    notifications,
    unreadCount: unreadNotifications,
    markRead: markNotificationRead,
    dismiss: dismissNotification,
  } = useNotifications(uid);
  const {
    activeWorkout,
    startWorkout,
    discardWorkout,
    screenLockActive,
    addExercise,
    removeExercise,
    reorderExercises,
    addSet,
    updateSet,
    removeSet,
  } = useActiveWorkout(uid);
  // Refs read by the "retry a deferred offline finish" effect below —
  // event listeners there would otherwise close over a stale render.
  // `pendingOfflineFinishRef` holds { sharePersonalRecords } while a
  // finish is waiting on the network, or null.
  const activeWorkoutRef = useRef(activeWorkout);
  const pendingOfflineFinishRef = useRef(null);
  const finishWorkoutRef = useRef(null);
  // Only ever populated for a trainee with a connected trainer — a trainer
  // signed into their own account simply has none, so this stays a no-op
  // for them rather than needing a role check.
  const { assignments, completeAssignment } = useAssignedWorkouts(uid);
  // A personal saved-routine library — same account for a trainer as for a
  // trainee, since they share one app experience. See WorkoutHome.jsx for
  // the scope note on why this isn't (yet) a trainer→trainee shared library.
  const { templates, saveTemplate, deleteTemplate } = useWorkoutTemplates(uid);
  // Jimmy's evolution tier from lifetime tonnage — computed once here and
  // reused for the app-wide accent theme (below) and the tier-up
  // celebration. `lastWorkoutAt` applies the neglect penalty (a 1-tier
  // drop after 5 days idle — see utils/evolutionTiers.js), so the whole
  // app's accent dulls to the lower tier until the user trains again.
  // getEvolutionProgress is pure and both helpers reduce the whole history
  // array, so doing it once matters as that array grows.
  const lastWorkout = lastWorkoutAt(workouts);
  const evolution = getEvolutionProgress(lifetimeVolume(workouts), { lastWorkoutAt: lastWorkout });
  // Latest logged body weight (0 = none yet). Tier math stays fully
  // relative; this only personalises how the progress bars RENDER those
  // relative goals as big absolute-kg numbers — see
  // utils/evolutionTiers.js's formatTierGoalKg (75 kg fallback there).
  const bodyWeightKg = Number(profile?.bodyWeightLog?.[0]?.weight) || 0;
  // Fires the confetti / screen-shake / haptic / XP-bar-rush sequence the
  // first time evolutionStage strictly increases past what's been
  // celebrated before — see the hook. `shaking` drives the shake class on
  // the app root; `barOverride` is handed to WorkoutHome's XP bar.
  const tierUp = useTierUpCelebration(evolution.current.stage);
  // Client-only "lazy goat" nudge — auto-disarms on app open / foreground
  // (below); armLazyNudge() is called after a workout is logged. Best
  // effort, Chrome/Android installed PWAs only — see the hook.
  const armLazyNudge = useLazyGoatNudge();
  // One-time "want notifications?" pitch — per account, per device (a
  // fresh browser/phone asks again, same as the real OS permission it
  // leads into). Namespaced by uid the same way every other per-account
  // localStorage key in this app is (see useLocalStorage's own comment on
  // why: App never remounts on account switch).
  const [notifPromptSeen, setNotifPromptSeen] = useLocalStorage(`notif-prompt-seen:${uid ?? 'anon'}`, false);

  // Pre-fills a routine's exercises from the last time each was performed,
  // so loading "Push Day" comes up with real numbers instead of a wall of
  // blanks. Same helper the mid-workout add path uses (see
  // ActiveWorkoutLogger's handleAdd) — without this, adding an exercise by
  // hand would pre-fill but loading a saved routine wouldn't, which is
  // exactly the kind of inconsistency nobody can explain to a user.
  // `workouts` is the already-cached history list; no extra reads.
  const withSeededSets = (presetExercises) =>
    (presetExercises ?? []).map((exercise) => ({
      ...exercise,
      seedSets: seedSetsFromHistory(lastPerformance(exercise.exerciseId, workouts), {
        count: DEFAULT_SETS_PER_EXERCISE,
        isBodyweight: isBodyweightExercise(exercise.exerciseId),
      }),
    }));

  const handleStartWorkout = () => {
    startWorkout();
    navigate('/workout');
  };

  const handleStartAssigned = (assignment) => {
    startWorkout(withSeededSets(assignment.exercises), assignment.id);
    navigate('/workout');
  };

  // Same starting point as an assigned workout (same {exerciseId, name,
  // muscleGroup} shape) but with no assignedWorkoutId — loading a template
  // never marks any trainer assignment complete.
  const handleStartTemplate = (template) => {
    startWorkout(withSeededSets(template.exercises));
    navigate('/workout');
  };

  // Deliberately NOT wrapped in try/catch here — a rejection (a set out of
  // bounds, the cooldown, today's logging limit — see functions/economy.js)
  // needs to propagate all the way back up to WorkoutSummaryModal's own
  // handler, which is what keeps the workout on-screen and shows the
  // message instead of silently discarding a workout that was never
  // actually saved. Only on success do we touch anything else — completing
  // an assignment, clearing the active workout, navigating away, or
  // announcing the reward.
  // Only used to decide whether the summary offers the share — the server
  // recomputes the records it actually publishes (functions/records.js).
  // `workouts` is history only; the workout being finished isn't in it yet.
  const activePersonalRecords = activeWorkout
    ? findNewPersonalRecords(activeWorkout.exercises, workouts)
    : [];

  const handleFinishWorkout = async ({ sharePersonalRecords = false } = {}) => {
    const workout = activeWorkoutRef.current;
    if (!workout) return;

    let result;
    try {
      result = await logWorkout(workout, { sharePersonalRecords });
    } catch (err) {
      if (isOfflineError(err)) {
        // logWorkout is a callable Cloud Function — Firestore's offline
        // cache (see lib/firebase.js) can only queue direct writes, not a
        // callable. The workout itself is already safe in localStorage
        // (useActiveWorkout), so keep it active, tell the user, and let
        // the `online` effect below retry it automatically. NOT rethrown:
        // the summary modal treats a throw as a hard failure to show in
        // red, which this isn't.
        // Leave the workout in activeWorkout (localStorage) — NOT discarded
        // — so it survives an app close in the basement and the retry
        // (below, plus on next launch) always has the real payload to send.
        pendingOfflineFinishRef.current = { sharePersonalRecords };
        setAppNotice({
          message:
            "📴 No signal — your workout is saved on this phone and will log automatically once you're back online.",
          tone: 'warning',
        });
        navigate('/');
        return;
      }
      throw err; // real rejection (validation / cooldown / cap) — modal surfaces it
    }

    pendingOfflineFinishRef.current = null;
    const { workoutId, coinsEarned, recoveryWorkout, neglectPenaltyLifted, newBadges, firstWorkoutReward } = result;
    if (workout.assignedWorkoutId) {
      completeAssignment(workout.assignedWorkoutId, workoutId);
    }
    // Captured BEFORE discardWorkout below clears the workout. Only
    // exercises with a completed set — the checklist is a record of what
    // was actually done, not what was planned.
    const performedNames = workout.exercises
      .filter((e) => e.sets.some((s) => s.completed))
      .map((e) => e.name);

    // (Re-)arm the 71h local re-engagement nudge off this fresh workout —
    // prompts for notification permission if it hasn't been asked. Fire
    // and forget; a failure here must never block finishing a workout.
    armLazyNudge();
    discardWorkout();
    navigate('/');

    // Everything a workout EARNS is deferred behind the checklist, so the
    // two moments land in sequence rather than the coin toast firing
    // underneath the ticking list. The checklist calls this when it's done.
    const showReward = () => {
      // The Silver Lootbox — exactly once, ever, the moment a brand-new
      // account finishes its very first real workout (see
      // functions/economy.js). The coin/badge toast below still fires as
      // usual; this is a SEPARATE full-screen moment for the free dance
      // specifically, not a replacement for it.
      if (firstWorkoutReward) setLootboxReward(firstWorkoutReward);

      if (recoveryWorkout) {
        // The server withheld coins/volume for this one (>= 5 days since
        // the last workout) regardless — but whether it actually LIFTED
        // the neglect penalty depends on whether it cleared
        // RECOVERY_MIN_SCORE (see functions/economy.js): a token effort
        // keeps the account "overdue" so the message has to say so rather
        // than implying the tier was restored when it wasn't.
        setAppNotice({
          message: neglectPenaltyLifted
            ? 'Comeback workout logged — tier restored. Log one more to start earning again.'
            : "That barely counted — Jimmy needs a real effort to lift the penalty. Log a proper session to restore your tier.",
          tone: neglectPenaltyLifted ? 'success' : 'warning',
        });
      } else if (newBadges?.length > 0 || coinsEarned > 0) {
        // Badges (functions/badges.js) trump the coin line — they're rarer.
        const badgeNames = (newBadges ?? []).map((id) => getBadge(id)?.name ?? 'New badge');
        const coinPart = coinsEarned > 0 ? `+${coinsEarned} coins` : null;
        const badgePart = badgeNames.length ? `🏅 ${badgeNames.join(' · ')} unlocked!` : null;
        setAppNotice({
          message: [badgePart, coinPart].filter(Boolean).join('  ·  '),
          tone: 'success',
        });
      }
    };

    if (performedNames.length > 0) {
      setFinishChecklist({ exercises: performedNames, reward: showReward });
    } else {
      showReward();
    }
  };

  // Keep the refs the offline-retry effect reads pointed at this render's
  // values (that effect has an empty dep array on purpose — it must
  // register its window listeners exactly once).
  useEffect(() => {
    activeWorkoutRef.current = activeWorkout;
    finishWorkoutRef.current = handleFinishWorkout;
  });

  // A workout finished with no signal (see handleFinishWorkout) stays in
  // activeWorkout with pendingOfflineFinishRef set. Retry it the moment
  // the connection returns, and once shortly after mount to cover "already
  // back online by the time the app reopened". A retry that still fails is
  // re-armed for the next reconnect; a real server rejection clears the
  // pending flag and resurfaces when the user reopens the summary.
  useEffect(() => {
    const retry = async () => {
      const pending = pendingOfflineFinishRef.current;
      if (!pending || !navigator.onLine || !activeWorkoutRef.current) return;
      pendingOfflineFinishRef.current = null;
      try {
        await finishWorkoutRef.current?.(pending);
      } catch {
        pendingOfflineFinishRef.current = pending;
      }
    };
    window.addEventListener('online', retry);
    const t = setTimeout(retry, 3000);
    return () => {
      window.removeEventListener('online', retry);
      clearTimeout(t);
    };
  }, []);

  // Saves the exercise lineup of the workout currently being finished —
  // called from WorkoutSummaryModal before onFinish actually commits it,
  // so `activeWorkout` (not yet cleared) is still the right source.
  const handleSaveTemplate = (title) => {
    if (!activeWorkout) return;
    saveTemplate(title, activeWorkout.exercises);
  };

  // Confirmation happens in ActiveWorkoutLogger's own ConfirmDialog now —
  // by the time this fires, the user already confirmed.
  const handleDiscardWorkout = () => {
    discardWorkout();
    navigate('/');
  };

  if (!firebaseConfigured) return <FirebaseSetupNeeded />;
  if (initializing) return null;
  if (!user) return <AuthScreen onSignUp={handleSignUp} onSignIn={signIn} onResetPassword={resetPassword} />;
  // Auth resolved but the Firestore profile doc hasn't loaded yet (or, very
  // briefly right after signup, is still being written) — same blank frame
  // rather than flashing the wrong role's UI, UNLESS it's actually broken
  // (profileError) or has been stuck long enough that "still loading" isn't
  // a believable explanation anymore (stuckLoading) — either way, someone
  // stuck here before had no way out except force-quitting the app/tab.
  if (profileError || stuckLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center bg-neutral-950 text-neutral-100">
        <p className="text-4xl">🐐</p>
        <p className="text-lg font-semibold">Jimmy tripped over the leash.</p>
        <p className="text-sm text-neutral-400 max-w-xs">
          {profileError
            ? "We couldn't load your profile — try signing out and back in."
            : "This is taking way longer than it should — try signing out and back in."}
        </p>
        <button
          type="button"
          onClick={signOut}
          className="mt-2 px-5 py-2.5 rounded-xl bg-white/10 text-white font-semibold"
        >
          Sign Out
        </button>
      </div>
    );
  }
  if (!account) return null;

  const isTrainer = account.role === 'trainer';
  // A trainer's tier reflects THEIR own lifting, same as a trainee's.
  // Applied as CSS custom properties so the whole app's accent (buttons,
  // active tab, glowing borders, ambient background) matches how far this
  // person has evolved, tying the rest of the UI back to the AuthScreen
  // showcase. `evolution` is computed up with the hooks above.
  const currentTier = evolution.current;

  return (
    <JimmyLookProvider evolutionStage={currentTier.stage} account={account}>
      <div
        className={`relative isolate min-h-screen bg-neutral-950${tierUp.shaking ? ' screen-shake' : ''}`}
        style={tierCssVars(currentTier.id)}
      >
        {/* The Fortnite/Arcade backdrop — grid, particles, speed lines, all
            defined in .ambient-bg itself now (index.css), so no inline
            override here (an earlier "colorful as login" pass used to pin
            a plain gradient over it via inline style; that's gone now that
            .ambient-bg's own background IS the design). `relative isolate`
            here plus an explicit z-index on .ambient-bg/.ambient-scrim (see
            index.css) — relying on plain DOM order to keep these two fixed,
            animated layers behind the page content was NOT reliable: on the
            /workout route specifically (which has its own separate `fixed`
            footer) they could end up compositing ON TOP of everything,
            hiding every button behind a wall of gradient. Real bug, found
            live on the deployed site, not a testing artifact. */}
        <div className="ambient-bg" />
        <div className="ambient-scrim" />
        <div className="max-w-md mx-auto px-4">
          {appNotice && (
            <div
              className={`relative z-10 mt-4 px-4 py-3 rounded-2xl border text-sm flex items-start gap-2 ${
                appNotice.tone === 'success'
                  ? 'bg-[var(--success)]/15 border-[var(--success)]/30 text-[var(--success)]'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-200'
              }`}
            >
              <span>{appNotice.tone === 'success' ? '🪙' : '⚠️'}</span>
              <p className="flex-1">{appNotice.message}</p>
              <button type="button" onClick={() => setAppNotice(null)} className="font-bold px-1 opacity-70">
                ✕
              </button>
            </div>
          )}
          <Suspense fallback={<ScreenFallback />}>
          <Routes>
            <Route
              element={
                <Layout
                  isTrainer={isTrainer}
                  tierId={currentTier.id}
                  coins={account.coins}
                  unreadNotifications={unreadNotifications}
                  onOpenSettings={() => setSettingsOpen(true)}
                />
              }
            >
              <Route
                index
                element={
                  activeWorkout ? (
                    <Navigate to="/workout" replace />
                  ) : (
                    <WorkoutHome
                      onStartWorkout={handleStartWorkout}
                      onStartAssigned={handleStartAssigned}
                      onStartTemplate={handleStartTemplate}
                      onDeleteTemplate={deleteTemplate}
                      assignments={assignments}
                      templates={templates}
                      workouts={workouts}
                      // Real recent-workout flavor text instead of the old
                      // mock friends' fake stats — see hooks/useFeed.js.
                      // {username, weeklyTonnage} shape kept exactly as
                      // WorkoutHome's buildHypeMessages() already expects, so
                      // that logic needed zero changes.
                      friends={feed.posts.map((p) => ({ username: p.userName, weeklyTonnage: p.totalVolume }))}
                      equippedDance={account.equippedDance}
                        barOverride={tierUp.barOverride}
                      lastWorkoutAt={lastWorkout}
                      bodyWeightKg={bodyWeightKg}
                    />
                  )
                }
              />
              <Route
                path="progress"
                element={
                  <ProgressView
                    workouts={workouts}
                    exercises={exercises}
                    bodyWeightKg={bodyWeightKg}
                  />
                }
              />
              <Route
                path="social"
                element={
                  <SocialPage
                    account={account}
                    emailVerified={emailVerified}
                    email={user?.email}
                    onResendVerification={resendVerification}
                    onRecheckVerification={refreshEmailVerified}
                    workouts={workouts}
                    feedPosts={feed.posts}
                    feedLoading={feed.loading}
                    feedError={feed.error}
                    myUid={uid}
                    myFriendCode={account?.friendCode}
                    friendUids={friendUids}
                    friends={friendsGraph.friends}
                    incomingRequests={friendsGraph.incomingRequests}
                    onSendRequest={friendsGraph.sendFriendRequest}
                    onRespond={friendsGraph.respondToFriendRequest}
                    onRemove={friendsGraph.removeFriend}
                    notifications={notifications}
                    onMarkNotificationRead={markNotificationRead}
                    onDismissNotification={dismissNotification}
                  />
                }
              />
              <Route
                path="friends/:friendUid"
                element={
                  <PublicFriendProfile
                    friends={friendsGraph.friends}
                    onSendNudge={friendsGraph.sendNudge}
                    onSaveTemplate={saveTemplate}
                    myUid={uid}
                  />
                }
              />
              <Route
                path="profile"
                element={
                  <ProfileView
                    account={account}
                    profile={profile}
                    updateDetails={updateDetails}
                    logBodyWeight={logBodyWeight}
                    deleteBodyWeightEntry={deleteBodyWeightEntry}
                    onConnectToTrainer={connectToTrainer}
                    onDisconnectFromTrainer={disconnectFromTrainer}
                    onNotifyTrainer={notifyTrainer}
                  />
                }
              />
              <Route
                path="shop"
                element={
                  <GymShop
                    account={account}
                    onPurchase={purchaseItem}
                    onEquip={equipItem}
                      onSetAccessories={setEquippedAccessories}
                    evolutionStage={currentTier.stage}
                    tierImage={currentTier.image}
                  />
                }
              />
              <Route
                path="history"
                element={<HistoryList workouts={workouts} deleteWorkout={deleteWorkout} />}
              />
              <Route
                path="workouts/:id"
                element={
                  <WorkoutDetail
                    workouts={workouts}
                    updateWorkout={updateWorkout}
                    deleteWorkout={deleteWorkout}
                  />
                }
              />

              {isTrainer && (
                <>
                  <Route
                    path="trainees"
                    element={<TrainerDashboard profile={account} workouts={workouts} onSignOut={signOut} />}
                  />
                  <Route
                    path="trainees/:traineeId"
                    element={<TraineeDetail profile={account} onRemoveTrainee={disconnectFromTrainer} />}
                  />
                  <Route
                    path="trainees/:traineeId/assign"
                    element={<AssignWorkoutForm profile={account} exercises={exercises} />}
                  />
                  <Route
                    path="trainees/:traineeId/workouts/:workoutId"
                    element={<TraineeWorkoutDetail profile={account} />}
                  />
                </>
              )}
            </Route>

            <Route
              path="workout"
              element={
                activeWorkout ? (
                  <ActiveWorkoutLogger
                    workout={activeWorkout}
                    exercises={exercises}
                    screenLockActive={screenLockActive}
                    onAddExercise={addExercise}
                    onRemoveExercise={removeExercise}
                    onReorderExercises={reorderExercises}
                    onAddSet={addSet}
                    onUpdateSet={updateSet}
                    onRemoveSet={removeSet}
                    onFinish={handleFinishWorkout}
                    personalRecords={activePersonalRecords}
                    history={workouts}
                    bodyWeightKg={bodyWeightKg}
                    onDiscard={handleDiscardWorkout}
                    onSaveTemplate={handleSaveTemplate}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </div>

        {/* The one-time notification pitch — deliberately held back while a
            workout is active (mid-set is the worst possible moment to
            interrupt with an unrelated prompt) even if this is technically
            someone's very first screen; it'll show the next time they land
            anywhere else instead of being skipped outright. */}
        {/* Null fallbacks: these are overlays, so showing nothing for the
            moment their chunk arrives is exactly the pre-open state. */}
        {!notifPromptSeen && !activeWorkout && (
          <Suspense fallback={null}>
            <NotificationPromptModal uid={uid} onDismiss={() => setNotifPromptSeen(true)} />
          </Suspense>
        )}

        {finishChecklist && (
          <Suspense fallback={null}>
            <WorkoutSummaryChecklist
              exercises={finishChecklist.exercises}
              onDone={() => {
                const { reward } = finishChecklist;
                setFinishChecklist(null);
                reward();
              }}
            />
          </Suspense>
        )}

        {lootboxReward && (
          <Suspense fallback={null}>
            <SilverLootboxModal
              reward={lootboxReward}
              evolutionStage={evolution.current.stage}
              onClose={() => setLootboxReward(null)}
            />
          </Suspense>
        )}

        {settingsOpen && (
          <Suspense fallback={null}>
            <SettingsPanel
              account={account}
              profile={profile}
              uid={uid}
              onUpdateUsername={updateUsername}
              onUpdateGoals={updateDetails}
              onUpdateDetails={updateDetails}
              onLogBodyWeight={logBodyWeight}
              onSignOut={signOut}
              onDeleteAccount={deleteAccount}
              onUpdateSharePRs={setSharePRs}
              onClose={() => setSettingsOpen(false)}
            />
          </Suspense>
        )}
      </div>
    </JimmyLookProvider>
  );
}
