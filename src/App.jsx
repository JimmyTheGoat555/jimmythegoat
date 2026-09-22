import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import WorkoutHome from './components/workout/WorkoutHome';
import BottomNav from './components/layout/BottomNav';
// The "your session is still running" bar. Eager — it is chrome that can
// appear on any screen at any moment, and a lazy boundary would mean it
// pops in a beat after you leave the workout.
import FloatingWorkoutBar from './components/workout/FloatingWorkoutBar';
import { TAB_PATHS, TRAINER_TAB_PATH } from './components/layout/tabPaths';
import AuthScreen from './components/auth/AuthScreen';
import PendingVerificationScreen from './components/auth/PendingVerificationScreen';
import FirebaseSetupNeeded from './components/auth/FirebaseSetupNeeded';
import TopHud from './components/layout/TopHud';
import AnnouncementBanner from './components/shared/AnnouncementBanner';
import Toast from './components/shared/Toast';
import { useBottomChrome } from './hooks/useBottomChrome';

// Monotonic id for transient notices — see the Toast mount at the bottom
// of this file. A counter rather than Date.now(): two notices raised in
// the same millisecond would collide on a timestamp, and the whole point
// of the id is that consecutive messages are never mistaken for one.
let noticeSeq = 0;
const nextNoticeId = () => (noticeSeq += 1);
import FounderMessageModal from './components/shared/FounderMessageModal';
import ForcedUsernameModal from './components/profile/ForcedUsernameModal';
import LegalConsentGate from './components/auth/LegalConsentGate';
import { useLegalConsent } from './hooks/useLegalConsent';
import { useCloudWorkoutHistory } from './hooks/useCloudWorkouts';
import { useCloudProfile } from './hooks/useCloudProfile';
import { useEconomy } from './hooks/useEconomy';
import { useActiveWorkout } from './hooks/useWorkouts';
import { useRestTimer } from './hooks/useRestTimer';
import { useExercises } from './hooks/useExercises';
import { useFriendsGraph } from './hooks/useFriendsGraph';
import { useFeed } from './hooks/useFeed';
import { useAuth } from './hooks/useAuth';
import { useNotifications } from './hooks/useNotifications';
import { useTierUpCelebration } from './hooks/useTierUpCelebration';
import { useLazyGoatNudge } from './hooks/useLazyGoatNudge';
import { useAssignedWorkouts } from './hooks/useAssignedWorkouts';
import { useWorkoutTemplates } from './hooks/useWorkoutTemplates';
import { useWorkoutInbox } from './hooks/useWorkoutInbox';
import { useModeration } from './hooks/useModeration';
import { useWorkoutCooldown } from './hooks/useWorkoutCooldown';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useTabSwipe } from './hooks/useTabSwipe';
import { firebaseConfigured } from './lib/firebase';
import { dismissSplash } from './lib/splash';
import { lifetimeVolume, lastWorkoutAt, workoutVolume } from './utils/workoutStats';
import { findNewPersonalRecords } from './utils/personalRecords';
import { EVOLUTION_TIERS, getEvolutionProgress, progressionScale, TRAINER_MIN_STAGE } from './utils/evolutionTiers';
import { lastPerformance, seedSetsFromHistory } from './utils/lastPerformance';
import { isBodyweightExercise } from './data/exercises';
import { withoutBlocked, withoutBlockedUids } from './utils/moderation';
import { firstWorkoutProblem } from './utils/validateWorkout';
import { reconcileWorkoutLoads } from './utils/setLoad';
// NOT lazy, unlike the other post-workout overlays. Measured: a lazy
// boundary costs ~300ms of blank home screen between cascade steps even
// with the chunk already prefetched — React throttles revealing content
// after a Suspense fallback. This component is an emoji, three lines of
// text and a button (canvas-confetti, the only heavy part, is still
// imported dynamically inside it), so there is nothing to defer and a
// visible seam to avoid.
import BadgeCelebrationModal from './components/workout/BadgeCelebrationModal';
// Phase 1 of the finish flow — the replay of the session just logged. NOT
// lazy, for the same reason BadgeCelebrationModal isn't: a Suspense
// boundary costs a visible blank seam, and this is the very first thing
// that should appear after "Done".
import WorkoutCelebration from './components/workout/WorkoutCelebration';
import { whenIdle } from './utils/idle';
// Last step of the same cascade, and eager for the same reason — see the
// note above and LockerReminderModal.jsx.
import LockerReminderModal from './components/workout/LockerReminderModal';
import ConfirmDialog from './components/shared/ConfirmDialog';
import { JimmyLookProvider } from './context/JimmyLook';
import { ModerationProvider } from './context/Moderation';
import { DEFAULT_SETS_PER_EXERCISE } from './hooks/useWorkouts';
import { tierCssVars, tierIsAnimated } from './utils/tierTheme';
import { unequippedRewardCount } from './utils/storeAlerts';
import { normalizeRestSeconds } from './utils/restPresets';
import { isAppAdmin } from './utils/appAdmin';

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
// The owner's own dashboard. Lazy and never prefetched: exactly one
// account in the world can open it, so shipping it to everyone else — or
// even warming it on idle — would be pure waste.
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'));
// Both are modals that render only once something opens them, and both pull
// in lib/messaging -> firebase/messaging, which otherwise sits in the
// startup bundle for the sake of a permission toggle most sessions never
// touch.
const NotificationPromptModal = lazy(() => import('./components/profile/NotificationPromptModal'));
const SettingsPanel = lazy(() => import('./components/profile/SettingsPanel'));
// A one-time, per-account overlay (the Silver Lootbox) — no reason to ship
// it in the startup bundle for the sessions that will never see it again.
const SilverLootboxModal = lazy(() => import('./components/workout/SilverLootboxModal'));
// Phase 2 of the finish flow — two prompts that only open after the
// celebration, and only when they apply (a freestyle lineup worth saving;
// records worth shouting about). Lazy: most sessions open neither.
const SaveRoutinePrompt = lazy(() => import('./components/workout/SaveRoutinePrompt'));
const SharePRsModal = lazy(() => import('./components/workout/SharePRsModal'));
// Only mounts when someone actually plans ahead; it drags in the whole
// exercise picker, which the landing screen otherwise never needs.
const PlanWorkoutModal = lazy(() => import('./components/workout/PlanWorkoutModal'));
// Opened from a template card on the landing screen, so it must NOT ride
// in on SocialPage's chunk (which is prefetched, but only on idle) — and
// it must not sit in the startup bundle either for a sheet most sessions
// never open.
const FriendPickerModal = lazy(() => import('./components/social/FriendPickerModal'));

function prefetchTabScreens() {
  import('./components/progress/ProgressView');
  import('./components/social/SocialPage');
  import('./components/shop/GymShop');
}

// Holds the same vertical space the tab screens occupy, so a chunk that
// arrives a frame late doesn't collapse the layout and bounce the nav.
function ScreenFallback() {
  return <div className="min-h-[calc(100dvh-12rem)]" aria-hidden="true" />;
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
function Layout({
  isTrainer,
  tierId,
  coins,
  unreadNotifications,
  unequippedRewards,
  onOpenSettings,
  // The in-progress session, or null. Passed as a prop rather than pulled
  // from a new WorkoutContext: `activeWorkout` already lives in App, which
  // is above the router and never unmounts on a route change, so a context
  // would move the same value the same distance through a second
  // mechanism. See the floating bar's own header comment for what was
  // actually missing here — it was never the state's lifetime.
  activeWorkout,
  // The running rest, or null when none is. Passed down the same way and
  // for the same reason `activeWorkout` is: it lives in App, which outlives
  // every route, and the bar that draws it is chrome Layout owns.
  restSecondsLeft = null,
  restOverdueSeconds = 0,
  onRestoreWorkout,
}) {
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
  const isWorkoutRoute = location.pathname === '/workout';
  // The minimised-workout bar's height, published to :root as well as to
  // the page container below. The inline style on that container is what
  // .pb-nav pages read; this makes the same value reachable from OUTSIDE
  // the routed tree, which is how the toast clears the bar instead of
  // being drawn on top of it. See hooks/useBottomChrome.js.
  useBottomChrome('--float-bar-h', activeWorkout && !isWorkoutRoute ? 'var(--float-bar-stack)' : null);
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
      {/* The logger has its own header (timer, Minimize, Cancel), so a
          second bar of chrome above it would push the whole session down
          for no gain — TopHud's own header comment already said it does
          not belong here. BottomNav, by contrast, DOES render on this
          route now: that is the point of the fix. */}
      {!isWorkoutRoute && <TopHud coins={coins} onOpenSettings={onOpenSettings} />}
      {/* The global announcement, when there is one (Founder Console →
          Operations). Same rule as the HUD: not over a live session. */}
      {!isWorkoutRoute && <AnnouncementBanner />}
      {/* A direct message from the founder to THIS account (Founder Console
          → Operations → Targeted User Actions), as a sheet. Same rule. */}
      {!isWorkoutRoute && <FounderMessageModal />}
      {/* --float-bar-h (index.css) goes non-zero here, and only here, while
          the minimised-workout bar below is on screen: every .pb-nav page
          and the lobby's floating Start button read it, so nothing ends
          up parked underneath the bar. */}
      <div
        ref={containerRef}
        style={{ '--float-bar-h': activeWorkout && !isWorkoutRoute ? 'var(--float-bar-stack)' : '0px' }}
      >
        {enterClass ? (
          <div key={location.pathname} className={enterClass}>
            <Outlet />
          </div>
        ) : (
          <Outlet />
        )}
      </div>
      {/* Everywhere EXCEPT the workout screen itself — there, the session
          is already the whole page. `fixed`, so it never takes part in any
          page's scrolling; the extra bottom padding those pages would need
          is handled by each screen's own .pb-nav (index.css), which
          already clears the tab row and has room for this. */}
      {activeWorkout && !isWorkoutRoute && (
        <FloatingWorkoutBar
          startedAt={activeWorkout.startedAt}
          exerciseCount={activeWorkout.exercises.length}
          setCount={activeWorkout.exercises.reduce((n, e) => n + e.sets.filter((set) => set.completed).length, 0)}
          restSecondsLeft={restSecondsLeft}
          restOverdueSeconds={restOverdueSeconds}
          onRestore={onRestoreWorkout}
        />
      )}
      <BottomNav
        isTrainer={isTrainer}
        tierId={tierId}
        unreadNotifications={unreadNotifications}
        unequippedRewards={unequippedRewards}
      />
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
// "Bench Press + Back Squat", or "Bench Press + 3 more". Was
// defaultTemplateName inside WorkoutSummaryModal, which no longer asks
// this question — the routine prompt does, after the celebration.
function defaultRoutineName(performed) {
  const names = (performed ?? []).map((e) => e.name);
  if (names.length === 0) return 'My Workout';
  if (names.length <= 2) return names.join(' + ');
  return `${names[0]} + ${names.length - 1} more`;
}

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
    changeEmail,
    deleteAccount,
    setSharePRs,
    setAskForLocker,
    setDefaultRestTimer,
    acceptLegal,
    setMascot,
    setRole,
    officialFriendUid,
  } = useAuth();
  const uid = user?.uid ?? null;
  // From the Auth user, NOT from the users/{uid} document: the doc's
  // `email` field is written once at signup and is not what Auth would
  // answer today, and it sits on a record this client could in principle
  // be handed a stale copy of. A client-side check either way — see
  // utils/appAdmin.js — so this only decides whether the door is drawn.
  const isAdmin = isAppAdmin(user?.email);

  // A one-line dismissible banner for non-fatal heads-ups that need to
  // survive a component unmounting right as they happen — originally just
  // signUp()'s "that trainer code didn't match" warning (AuthScreen
  // unmounts the instant `user` is set below, before its own local state
  // would ever get a chance to paint), now also used for "+N coins
  // earned" after a workout — same shape, same reason it lives up here
  // instead of on whichever screen triggered it.
  // Every notice carries a fresh id. Toast keys its pill on it, so two
  // messages with the SAME text back to back (finish a workout, finish
  // another) visibly replay the slide-in instead of silently resetting a
  // timer behind an identical-looking pill that never appeared to move.
  const [appNotice, setAppNotice] = useState(null);
  // Stable identity, and it matters: Toast holds its auto-dismiss timer in
  // an effect that depends on this callback. An inline arrow would be a
  // new function on every render of App — which re-runs that effect and
  // restarts the countdown — so a busy screen could keep a toast up
  // indefinitely. useCallback with no deps pins it for the session.
  const dismissNotice = useCallback(() => setAppNotice(null), []);
  // The Silver Lootbox — set once, ever, per account, the moment
  // logWorkout's response carries a firstWorkoutReward (see
  // handleFinishWorkout below). Rendered as its own full-screen overlay
  // rather than folded into appNotice's small toast — see
  // SilverLootboxModal.jsx.
  const [lootboxReward, setLootboxReward] = useState(null);
  // Badge ids earned by the workout just logged — step 2 of the cascade.
  const [badgeCelebration, setBadgeCelebration] = useState(null);
  // ── The finish-flow state machine ──────────────────────────────────────
  //
  // One object, or null when no workout has just been logged. `step` is
  // where we are; `queue` is what is left after this one.
  //
  //   celebration  → WorkoutCelebration (Phase 1, always)
  //   saveRoutine  → SaveRoutinePrompt  (Phase 2a, freestyle lineups only)
  //   sharePRs     → SharePRsModal      (Phase 2b, only if records broken)
  //
  // The badge and lootbox overlays sit BETWEEN the two phases, guarded on
  // this object — see the render block. Expressing the order as a queue
  // rather than a chain of onClose callbacks means no step needs to know
  // what follows it, and a step that doesn't apply is simply never queued
  // instead of being a render condition somebody has to remember.
  const [finishFlow, setFinishFlow] = useState(null);
  const handleSignUp = async (data) => {
    const { warning, verificationSent } = await signUp(data);
    // The trainer-code warning wins the one notice slot when both apply:
    // it says something went wrong, and the verification line is only
    // ever a nudge. The banner below carries the verification message
    // anyway until the address is confirmed, so nothing is lost.
    // The "check your inbox" line is the verification screen's whole job
    // now, so signing up no longer needs to say it here — this notice
    // would render behind the gate and never be seen anyway. What still
    // has to get through is a problem: a trainer code that did not
    // resolve, or a verification email that failed to send, both of which
    // the gate renders for us.
    if (warning) setAppNotice({ id: nextNoticeId(), message: warning, tone: 'warning' });
    else if (!verificationSent) {
      setAppNotice({
        id: nextNoticeId(),
        message: "We couldn't send the verification email — use Resend below.",
        tone: 'warning',
      });
    }
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
  const { logWorkout, publishWorkoutRecords, purchaseItem, equipItem, setEquippedAccessories, setFeaturedBadges } =
    useEconomy(uid);
  // Blocking and reporting — see hooks/useModeration.js. Reads
  // `account.blockedUsers` off the profile listener that is already open,
  // so this costs no extra reads.
  const moderation = useModeration(uid, account);
  // Social graph + feed — see hooks/useFriendsGraph.js and useFeed.js.
  // `account.friends` (bare uids) is the source of truth; both hooks derive
  // from it rather than holding their own copy.
  //
  // Blocked accounts come out HERE, once, rather than in each of the four
  // things downstream of this array — the feed query, the friends
  // directory, the leaderboard and the public summaries all read it, and
  // filtering at the source means a blocked friend's posts are never
  // FETCHED rather than fetched and then hidden. withoutBlockedUids hands
  // back the same array when nothing is blocked, which matters: useFeed
  // keys a live Firestore listener on this list.
  const friendUids = withoutBlockedUids(account?.friends ?? [], moderation.blockedUids);
  const friendsGraph = useFriendsGraph(uid, friendUids);
  // Blocking somebody who has a request pending withdraws the question:
  // their row goes, and so does the badge that was pointing at it. The
  // request document itself stays put, unanswered, which is the honest
  // outcome — declining is a thing you choose, and a block should not
  // quietly send a "no" on your behalf.
  const incomingRequests = useMemo(
    () => withoutBlocked(friendsGraph.incomingRequests, moderation.blockedUids, (req) => req.fromUid),
    [friendsGraph.incomingRequests, moderation.blockedUids],
  );
  const feed = useFeed(friendUids);
  // In-app notification inbox (weigh-in reminders, trainer weigh-in
  // updates, friend nudges). Lifted here from ProfileView so the unread
  // count can drive a badge on the Social tab in BottomNav — the inbox
  // itself renders on the Social tab now, not Profile (which is
  // stats-only). See hooks/useNotifications.js.
  const {
    notifications: allNotifications,
    markRead: markNotificationRead,
    dismiss: dismissNotification,
  } = useNotifications(uid);
  // A blocked account gets no row in the bell and no unread dot for one.
  // The sender rides at `data.fromUid` — stamped by every function that
  // writes here (nudges.js, cheerNotifications.js, recommendWorkout.js) —
  // and a notification with nobody behind it (a weigh-in reminder from the
  // scheduled job) has no fromUid and is therefore never filtered.
  //
  // The unread count is recomputed from the FILTERED list rather than
  // taken from the hook: a badge that counts rows you cannot see sends you
  // to a screen with nothing new on it.
  const notifications = useMemo(
    () => withoutBlocked(allNotifications, moderation.blockedUids, (n) => n.data?.fromUid),
    [allNotifications, moderation.blockedUids],
  );
  const unreadNotifications = notifications.filter((n) => !n.read).length;
  const {
    activeWorkout,
    startWorkout,
    discardWorkout,
    answerLocker,
    screenLockActive,
    addExercise,
    removeExercise,
    reorderExercises,
    addSet,
    addDropSet,
    updateSet,
    removeSet,
    linkSuperset,
    unlinkSuperset,
    bindRestBoost,
  } = useActiveWorkout(uid);
  // The rest countdown, owned HERE rather than inside ActiveWorkoutLogger.
  //
  // It used to live in the logger, which is mounted by the /workout route
  // — so leaving that route unmounted the hook and took the running rest
  // with it. Tap Feed mid-rest and the countdown was simply gone, the
  // alarm with it, with nothing on screen to say so. Sitting beside
  // `activeWorkout` itself, above the router, it now survives a route
  // change exactly as the session does: the alarm still fires wherever the
  // lifter is, the clock is still right when they come back, and the
  // floating bar can show the countdown instead of the elapsed time (see
  // Layout's FloatingWorkoutBar below).
  //
  // The length comes from the account exactly as the logger used to read
  // it. `?.` and normalizeRestSeconds because hooks run before the early
  // returns below — on the very first renders there is no profile yet, and
  // an absent value has to collapse to the 90s default rather than NaN.
  const rest = useRestTimer(normalizeRestSeconds(account?.defaultRestTimer));
  // Terms and Privacy Policy consent — the gate below the username gate.
  const legal = useLegalConsent(user, account, acceptLegal);

  // Portrait, the way a game is: the manifest's orientation lock covers
  // the installed app, and this asks a browser tab for the same. It is
  // allowed to fail — iOS Safari has no lock(), and Android only grants
  // one in fullscreen — and a tab that stays rotatable simply gets the
  // phone-width column the layout already is (max-w-md mx-auto below),
  // rather than the overlay that used to ask people to turn the phone.
  useEffect(() => {
    try {
      screen.orientation?.lock?.('portrait')?.catch?.(() => {});
    } catch {
      // Unsupported or refused — nothing to do.
    }
  }, []);
  // A rest belongs to ONE session, so end it whenever the session changes.
  //
  // Keyed on the workout ID, never on the object: `activeWorkout` is
  // replaced on every logged set, and watching it directly would cancel
  // each rest a frame after the set that started it. Finishing, discarding
  // and starting a different workout all change this id, and all three
  // should take a running countdown — and its scheduled notification —
  // with them. As cleanup rather than an effect body so it runs on the way
  // OUT of a session, not on the way into one.
  const activeWorkoutId = activeWorkout?.id ?? null;
  const dismissRest = rest.dismiss;
  useEffect(() => () => dismissRest(), [activeWorkoutId, dismissRest]);
  // { title, exercises } awaiting the "show this on your profile?" answer.
  const [pendingTemplate, setPendingTemplate] = useState(null);
  // The "plan a workout for later" sheet.
  const [planningWorkout, setPlanningWorkout] = useState(false);
  // Refs read by the "retry a deferred offline finish" effect below —
  // event listeners there would otherwise close over a stale render.
  // `pendingOfflineFinishRef` holds { sharePersonalRecords,
  // sharedRecordExerciseIds } while a finish is waiting on the network, or
  // null.
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

  // Routines friends have sent over, and the sheet for sending one out.
  // Both live up here rather than inside WorkoutHome/SocialPage because
  // the two ends of this loop are on different tabs: you send from the
  // template carousel on the landing screen and receive on Social.
  const workoutInbox = useWorkoutInbox(uid);
  // The inbox is the one surface carrying free text somebody else typed
  // (the 140-character note on a recommended workout — see
  // functions/recommendWorkout.js), so it is the one a block most needs to
  // clear. The item keeps pointing at its sender as `senderUid`.
  const inboxItems = useMemo(
    () => withoutBlocked(workoutInbox.items, moderation.blockedUids, (item) => item.senderUid),
    [workoutInbox.items, moderation.blockedUids],
  );

  // Whether a workout can be STARTED right now. The server has always
  // refused one logged inside the cooldown window; this is what moves that
  // refusal to before the first set instead of after the last.
  // ADMIN BYPASS — the owner's account skips the 4h gate between sessions
  // so the finish flow can be tested repeatedly. `isAdmin` is the same
  // client-side visibility check the Admin route uses (src/utils/appAdmin.js)
  // and is NOT a security boundary: the server has its own, Auth-resolved
  // bypass in functions/economy.js, and that is the one that decides.
  // Patching this flag in devtools unlocks a button whose call the server
  // would still refuse.
  const workoutCooldown = useWorkoutCooldown(uid, { bypass: isAdmin });
  const [recommendingTemplate, setRecommendingTemplate] = useState(null);
  // Jimmy's evolution tier from lifetime tonnage — computed once here and
  // reused for the app-wide accent theme (below) and the tier-up
  // celebration. `lastWorkoutAt` applies the neglect penalty (a 1-tier
  // drop after 5 days idle — see utils/evolutionTiers.js), so the whole
  // app's accent dulls to the lower tier until the user trains again.
  // getEvolutionProgress is pure and both helpers reduce the whole history
  // array, so doing it once matters as that array grows — and once per
  // CHANGE of that array, not once per render: this component re-renders
  // every second while a rest timer runs (useRestTimer lives here), and a
  // reduce over a long history on every tick was a steady drain on the
  // active-workout screen.
  const lastWorkout = useMemo(() => lastWorkoutAt(workouts), [workouts]);
  const lifetimeKg = useMemo(() => lifetimeVolume(workouts), [workouts]);
  // A coaching account starts at buff — see TRAINER_MIN_STAGE. Derived
  // once here and passed down, rather than each screen re-deciding who is
  // a trainer, so the goat on the home screen and the goat on the
  // leaderboard can never disagree.
  //
  // ADMIN-ONLY, TESTING — a second floor the owner can raise from
  // Settings ("Force Next Evolve") to walk every screen through the four
  // tiers without logging fifty workouts. Per account, per device
  // (localStorage), never written to Firestore: the leaderboard, the feed
  // and a friend's view of this account keep the real tier. Applied
  // through the same `minStage` floor a coaching account already uses,
  // so nothing downstream learns a new concept — the lobby, the store
  // cards, the evolution card's crossfade and the tier-up celebration
  // all simply see a higher stage. Ignored entirely for anyone else.
  const [debugStage, setDebugStage] = useLocalStorage(`debug-stage:${uid}`, 1);
  const forcedStage = isAdmin ? Math.min(EVOLUTION_TIERS.length, Math.max(1, Number(debugStage) || 1)) : 1;
  const minStage = Math.max(account?.role === 'trainer' ? TRAINER_MIN_STAGE : 1, forcedStage);
  // Whose ladder: 0.65 of every threshold for a female account (Gena, or
  // a 'female' onboarding answer), the table itself for everyone else —
  // see THE FEMALE SCALE in utils/evolutionTiers.js. Handed down beside
  // minStage to every screen that draws your own tier or bar.
  const progression = progressionScale(account);
  const evolution = getEvolutionProgress(lifetimeKg, {
    lastWorkoutAt: lastWorkout,
    minStage,
    scale: progression,
  });
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
        exerciseId: exercise.exerciseId,
      }),
    }));

  // The guard that the old `/` -> `/workout` redirect was really providing.
  //
  // startWorkout() REPLACES whatever session is in progress — it builds a
  // fresh emptyWorkout and sets it, with no merge and no undo. While the
  // home screen was unreachable mid-session that could not be triggered;
  // now that a lifter can stand on it with a workout running, all three
  // start entrances are one tap away from silently binning logged sets.
  //
  // So the confirmation lives HERE, at the one function that can destroy
  // work, rather than being approximated by locking a tab. The pending
  // action is held as a thunk so this knows nothing about which of the
  // three kinds of start is waiting on the answer.
  const [pendingStart, setPendingStart] = useState(null);

  const requestStart = (begin) => {
    if (activeWorkout) {
      setPendingStart(() => begin);
      return;
    }
    begin();
  };

  const handleStartWorkout = () =>
    requestStart(() => {
      startWorkout();
      navigate('/workout');
    });

  const handleStartAssigned = (assignment) =>
    requestStart(() => {
      startWorkout(withSeededSets(assignment.exercises), { assignedWorkoutId: assignment.id });
      navigate('/workout');
    });

  // Same starting point as an assigned workout (same {exerciseId, name,
  // muscleGroup} shape) but with no assignedWorkoutId — loading a template
  // never marks any trainer assignment complete. The id rides along so the
  // server can tell whether a friend recommended this routine and owes
  // them a bounty (functions/economy.js).
  const handleStartTemplate = (template) =>
    requestStart(() => {
      startWorkout(withSeededSets(template.exercises), { templateId: template.id });
      navigate('/workout');
    });

  // One of Jimmy's Workouts (data/jimmyWorkouts.js, via the Start Workout
  // sheet). The same start as a template — each exercise seeded from the
  // lifter's own last performance of it — except the program's
  // prescription sets the number of sets and the reps on every one of
  // them; only the weight comes from history. No templateId: it is not
  // the lifter's routine yet, so the finish flow still offers to save it
  // as one, under the session's own name.
  const handleStartProgram = (program) =>
    requestStart(() => {
      const preset = program.exercises.map((exercise) => ({
        ...exercise,
        seedSets: seedSetsFromHistory(lastPerformance(exercise.exerciseId, workouts), {
          count: exercise.sets,
          reps: exercise.reps,
          isBodyweight: isBodyweightExercise(exercise.exerciseId),
          exerciseId: exercise.exerciseId,
        }),
      }));
      startWorkout(preset, { programId: program.id, programTitle: program.title });
      navigate('/workout');
    });

  // Deliberately NOT wrapped in try/catch here — a rejection (a set out of
  // bounds, the cooldown, today's logging limit — see functions/economy.js)
  // needs to propagate all the way back up to WorkoutSummaryModal's own
  // handler, which is what keeps the workout on-screen and shows the
  // message instead of silently discarding a workout that was never
  // actually saved. Only on success do we touch anything else — completing
  // an assignment, clearing the active workout, navigating away, or
  // announcing the reward.
  // The client's optimistic PR guess used to feed the summary modal's
  // share switch. Gone with it: Phase 2b asks AFTER logWorkout has
  // returned, so it shows the SERVER's list (functions/records.js) rather
  // than a prediction that could disagree with what actually got
  // published.

  //
  // ── OPTIMISTIC ──
  // `optimistic` — from the summary modal's "Done": the celebration
  // starts NOW, on the client's own numbers, while the callable is in
  // flight. The card's time and volume are what the modal just showed;
  // the PR pills start from the client's guess (findNewPersonalRecords)
  // and are replaced by the server's list the moment it answers, which
  // is normally before the first row is struck. Coins and everything
  // after the celebration wait for the server: "Continue" reads
  // "Saving…" until then (`settled`). The workout is NOT discarded until
  // the server accepts it, and a rejection takes the celebration down
  // and leaves the summary modal — still mounted beneath it — showing
  // the reason. That path is now only reachable for the rejections a
  // client cannot predict (the cooldown, a spent boost token): everything
  // this device can decide for itself is decided in STEP 1 below, before
  // the celebration starts at all. The offline retry does not pass
  // `optimistic`: a celebration appearing out of nowhere because the
  // connection came back is not a transition anyone asked for.
  const handleFinishWorkout = async (
    { sharePersonalRecords = false, sharedRecordExerciseIds = null } = {},
    { optimistic = false } = {},
  ) => {
    const workout = activeWorkoutRef.current;
    if (!workout) return;

    // ── STEP 1 — validate, before ANYTHING moves ────────────────────────
    //
    // First statement of the finish, and deliberately ahead of every line
    // below it, including the optimistic celebration. The server does
    // these same checks and refuses the whole workout on any of them, and
    // the celebration used to start while that call was still in the air:
    // a rejection landed as a card being pulled off the screen and
    // replaced by red text, which reads as the app taking back something
    // it had already given.
    //
    // Checked against the RECONCILED payload — the exact array useEconomy
    // is about to send — so a set the reconciler repairs on the way out
    // is not reported here as broken.
    //
    // Thrown, not shown: WorkoutSummaryModal's own handler already keeps
    // the workout on screen and prints the message under the numbers,
    // which is the one place the lifter can act on it. `finishBlocked`
    // marks it as a verdict rather than a failure — nothing about it
    // improves by being tried again (see the offline retry).
    const problem = firstWorkoutProblem(reconcileWorkoutLoads(workout.exercises));
    if (problem) {
      const blocked = new Error(problem.message);
      blocked.finishBlocked = true;
      throw blocked;
    }

    // ── STEP 2 — from here the workout is going to be saved ─────────────
    //
    // The locker number, read off the ref's snapshot because discardWorkout()
    // below wipes the real thing. Null whenever the question was skipped,
    // answered "no locker", or never asked — and null is what decides
    // whether the cascade opens on the reminder or straight on the
    // celebration.
    const lockerNumber = workout.lockerNumber ?? null;
    // Where the finish flow STARTS. The locker reminder used to be step 4,
    // after the celebration, the badges and the chest; it is step 0 now.
    // The practical thing goes first, while the phone is still in the
    // lifter's hand and they are still standing next to the locker —
    // ninety seconds of confetti later they are already walking, and a
    // modal that arrives then is a modal in the way.
    const firstStep = lockerNumber ? 'locker' : 'celebration';
    // Completed sets only — the celebration is a record of what was done.
    const performed = workout.exercises
      .map((e) => ({ name: e.name, sets: e.sets.filter((set) => set.completed) }))
      .filter((e) => e.sets.length > 0);
    // The client's own figures, for the card while the server decides.
    // Same clamp the server applies to a start time from the future or
    // more than 48h old.
    const startedAt = Date.parse(workout.startedAt);
    const clientDurationMs = Number.isFinite(startedAt)
      ? Math.max(0, Math.min(48 * 60 * 60 * 1000, Date.now() - startedAt))
      : 0;
    const clientVolumeKg = workoutVolume(workout, bodyWeightKg);
    const optimisticRecords = findNewPersonalRecords(
      workout.exercises
        .map((e) => ({ ...e, sets: e.sets.filter((set) => set.completed) }))
        .filter((e) => e.sets.length > 0),
      workouts,
    );
    if (optimistic) {
      setFinishFlow({
        step: firstStep,
        lockerNumber,
        settled: false,
        queue: [],
        workoutId: null,
        exercises: performed,
        durationMs: clientDurationMs,
        totalVolumeKg: clientVolumeKg,
        personalRecords: optimisticRecords,
        recommendationBounty: null,
        coinsEarned: 0,
        coinBoosts: [],
        routineName: workout.programTitle || defaultRoutineName(performed),
        routineExercises: workout.exercises,
        reward: () => {},
      });
    }

    let result;
    try {
      result = await logWorkout(workout, { sharePersonalRecords, sharedRecordExerciseIds });
    } catch (err) {
      // Whichever way it failed, the celebration comes down: the summary
      // modal is still mounted underneath it, with the workout intact.
      if (optimistic) setFinishFlow(null);
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
        // The whole choice, not just the boolean: a retry an hour later
        // must publish exactly the records the lifter ticked at the end of
        // the session, not all of them.
        pendingOfflineFinishRef.current = { sharePersonalRecords, sharedRecordExerciseIds };
        setAppNotice({
          id: nextNoticeId(),
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
    const {
      workoutId,
      coinsEarned,
      recoveryWorkout,
      neglectPenaltyLifted,
      newBadges,
      firstWorkoutReward,
      totalVolumeKg,
      // Wall-clock length of the session, measured server-side from the
      // stored start and finish (functions/economy.js). Deliberately not
      // recomputed here from activeWorkout.startedAt: the server clamps a
      // start time that is in the future or more than 48h old, and a
      // celebration headlining "72h 14m" over a history entry that says
      // zero is the kind of disagreement nobody can explain afterwards.
      durationMs,
      // Set only when this session paid a friend for recommending the
      // routine — the finisher's half of that loop is one line on the
      // summary, nothing more.
      recommendationBounty,
      // Which exercises a rest-timer boost was actually applied to —
      // again the server's answer, since a token the client pinned may
      // have expired or been spent by the time the workout was logged.
      coinBoosts,
      // The account had no body weight on file, so the server scored this
      // session against an assumed average rather than rejecting it (see
      // functions/economy.js). The workout is logged and paid; this is
      // only a prompt to fix the number for next time.
      bodyWeightAssumed,
      // The SERVER's list, not the client's optimistic guess — it is the
      // side that decided, and a recovery workout gets an empty one.
      personalRecords: earnedRecords,
    } = result;
    if (workout.assignedWorkoutId) {
      completeAssignment(workout.assignedWorkoutId, workoutId);
    }
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
      // Both are QUEUED here; the render below decides what is on screen
      // and in what order. Setting them together rather than chaining
      // callbacks keeps "what did this workout earn" in one place and the
      // sequencing in one place, instead of spread across three onClose
      // handlers that each have to know what comes next.
      if (newBadges?.length > 0) setBadgeCelebration(newBadges);
      // No longer gated on ENABLE_EMOTES: the chest used to contain a
      // dance, which is why it was hidden with them. It contains the Ball
      // Cap now (functions/storeCatalog.js's STARTER_ACCESSORY_ID) — an
      // item the account can actually see on its goat — so the moment is
      // back on for everyone.
      if (firstWorkoutReward) setLootboxReward(firstWorkoutReward);
      // The locker reminder is NOT queued here any more — it is step 0 of
      // the flow now, shown and acknowledged before the celebration ever
      // mounts. See `firstStep` above.

      if (recoveryWorkout) {
        // The server withheld coins/volume for this one (>= 5 days since
        // the last workout) regardless — but whether it actually LIFTED
        // the neglect penalty depends on whether it cleared
        // RECOVERY_MIN_SCORE (see functions/economy.js): a token effort
        // keeps the account "overdue" so the message has to say so rather
        // than implying the tier was restored when it wasn't.
        setAppNotice({
          id: nextNoticeId(),
          message: neglectPenaltyLifted
            ? 'Comeback workout logged — tier restored. Log one more to start earning again.'
            : 'That barely counted — Jimmy needs a real effort to lift the penalty. Log a proper session to restore your tier.',
          tone: neglectPenaltyLifted ? 'success' : 'warning',
        });
      } else if (bodyWeightAssumed) {
        // Said INSTEAD of the coin line, not beside it: this one asks for
        // something, and a toast that both congratulates and requests
        // gets read as neither. The coins are on the celebration screen
        // the lifter has just come through anyway.
        setAppNotice({
          id: nextNoticeId(),
          message: 'Workout saved. Add your body weight in Profile — Jimmy scored this one against an average lifter.',
          tone: 'warning',
        });
      } else if (coinsEarned > 0) {
        // Coins only. Badges used to share this line; they now get a
        // full-screen moment of their own (BadgeCelebrationModal), and
        // naming them here as well would announce the same trophy twice.
        setAppNotice({ id: nextNoticeId(), message: `+${coinsEarned} coins`, tone: 'success' });
      }
    };

    // Warm the lootbox chunk while the tick-list is still playing, so its
    // download is not also part of the seam. (The seam itself is React's
    // Suspense reveal throttle, which is why the badge modal above is not
    // lazy at all.)
    if (firstWorkoutReward) import('./components/workout/SilverLootboxModal');

    // What Phase 2 will ask, decided once, here — so the celebration can
    // hand straight over without re-deriving anything from a workout that
    // no longer exists.
    //
    // "If applicable" for the routine prompt means: this lineup isn't
    // already a saved routine. A session loaded FROM a template or a
    // trainer's assignment is one, and being asked to save a copy of the
    // thing you just opened is the kind of prompt people learn to dismiss
    // without reading.
    const queue = [];
    const canSaveRoutine = !workout.templateId && !workout.assignedWorkoutId && performed.length > 0;
    if (canSaveRoutine) queue.push('saveRoutine');
    // The SERVER's list, and only when the workout actually produced a
    // feed post to amend (a recovery workout doesn't).
    const shareable = recoveryWorkout ? [] : (earnedRecords ?? []);
    if (shareable.length > 0) queue.push('sharePRs');

    const settled = {
      step: firstStep,
      lockerNumber,
      settled: true,
      queue,
      workoutId,
      exercises: performed,
      // The card is already counting the client's figures up when this
      // arrives in the optimistic case; swapping them mid-count would make
      // the number jump. History shows the server's — they differ, if at
      // all, by the bodyweight re-scoring.
      durationMs: optimistic ? clientDurationMs : durationMs,
      totalVolumeKg: optimistic ? clientVolumeKg : totalVolumeKg,
      personalRecords: shareable,
      recommendationBounty: recommendationBounty ?? null,
      coinsEarned: recoveryWorkout ? 0 : coinsEarned,
      coinBoosts: recoveryWorkout ? [] : (coinBoosts ?? []),
      routineName: workout.programTitle || defaultRoutineName(performed),
      // Captured, not read later: `workout` is about to be discarded, and
      // reading activeWorkout inside the prompt's handler would find null
      // and silently save nothing.
      routineExercises: workout.exercises,
      reward: showReward,
    };
    // Optimistic: the flow is already on screen, so this is a props update
    // — the server's records and coins landing on it. The STEP is taken
    // from what is on screen, not from `settled`: the lifter may have
    // already dismissed the locker reminder and be watching the
    // celebration, and resetting them to step 0 would replay a modal they
    // have answered. Null means the finish was rejected and torn down
    // between the two, in which case there is nothing to update.
    //
    // Otherwise (the offline retry) the flow mounts when the main thread
    // is free, not in the frame the callable resolves in: that frame is
    // busy with the server's writes landing in five listeners at once
    // (the profile's coins, the history, the feed post, the economy doc,
    // notifications), each re-rendering this tree.
    if (optimistic) setFinishFlow((prev) => (prev ? { ...settled, step: prev.step } : prev));
    else whenIdle(() => setFinishFlow(settled), { timeout: 300 });
  };

  // Step 0 → Phase 1. The locker reminder is the one screen in the cascade
  // that is not a reward, so it does not go through advanceFinishFlow: it
  // fires no `reward()`, consumes no queue entry and — crucially — is not
  // gated on `settled`, because there is nothing for the server to say
  // about a locker number. It is dismissable the instant it appears, even
  // while logWorkout is still in the air, which is the whole reason it can
  // go first without costing anybody a moment's wait.
  const dismissLockerReminder = () => {
    setFinishFlow((current) => (current?.step === 'locker' ? { ...current, step: 'celebration' } : current));
  };

  // Phase 1 is now TWO steps — the locker reminder and then the
  // celebration — and the reward modals below have to stay behind both of
  // them. They used to say `step !== 'celebration'`, which was the same
  // thing when the celebration was the first step and is not any more: a
  // badge or a chest HELD from an earlier workout (see the guards' own
  // note — a queued reward waits out a session that has since started)
  // would otherwise be let through the moment this flow opened on the
  // locker, and land on top of it.
  const inFinishPhase1 = finishFlow?.step === 'locker' || finishFlow?.step === 'celebration';

  // Advances the machine one step. Called by every Phase 1/2 screen when
  // it is finished with the user; `reward` fires exactly once, on the way
  // out of the celebration, so the coin toast and the badge/chest overlays
  // queue up behind Phase 1 rather than under it.
  const advanceFinishFlow = () => {
    const current = finishFlow;
    if (!current) return;
    // Not before the server has answered: the reward and the PR share
    // are its to give. The celebration's own button says "Saving…".
    if (current.settled === false) return;
    // Read and fired OUTSIDE the setState updater on purpose: React is
    // free to re-run an updater (StrictMode does, on every commit), and a
    // side effect in there would queue the badge modal twice.
    if (current.step === 'celebration') current.reward();
    setFinishFlow(
      current.queue.length === 0 ? null : { ...current, step: current.queue[0], queue: current.queue.slice(1) },
    );
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
      } catch (err) {
        // A finish blocked by validation is a verdict, not a failed
        // attempt — the payload is the same every time, so re-arming it
        // would retry a refusal on every reconnect, forever. The workout
        // stays in activeWorkout either way; this one simply waits for the
        // lifter to reopen the summary and read what is wrong with it.
        if (!err?.finishBlocked) pendingOfflineFinishRef.current = pending;
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
  // Both routes into a saved template end here, so the "show this on
  // your profile?" opt-in is asked once, the same way, whether the
  // routine came from a workout just finished or one planned in advance.
  const promptSaveTemplate = (title, exercises) => {
    if (!exercises?.length) return;
    setPendingTemplate({ title, exercises });
  };

  // handleSaveTemplate lived here to bridge the summary modal's toggle,
  // capturing activeWorkout.exercises before the finish cleared them. The
  // finish flow captures the same list into `routineExercises` when the
  // workout is logged, so Phase 2a can call promptSaveTemplate directly
  // and this middleman is gone.

  // Both answers save the template; they differ only in whether it also
  // goes on the profile. Dismissing the sheet (tapping outside) takes the
  // private path — "I didn't answer" must not mean "throw my routine
  // away", and it must never mean "publish it".
  const resolvePendingTemplate = (isPublic) => {
    if (pendingTemplate) {
      saveTemplate(pendingTemplate.title, pendingTemplate.exercises, { isPublic });
    }
    setPendingTemplate(null);
  };

  // Confirmation happens in ActiveWorkoutLogger's own ConfirmDialog now —
  // by the time this fires, the user already confirmed.
  const handleDiscardWorkout = () => {
    discardWorkout();
    navigate('/');
  };

  // The HTML launch screen (index.html, lib/splash.js) stays up through
  // the two moments this component renders nothing — auth resolving, then
  // the profile loading — and goes the instant there is a real screen to
  // show: sign-in, a gate, the loading-error card, or the app itself.
  const splashReady =
    !firebaseConfigured || (!initializing && (!user || Boolean(account) || Boolean(profileError) || stuckLoading));
  useEffect(() => {
    if (splashReady) dismissSplash();
  }, [splashReady]);

  if (!firebaseConfigured) return <FirebaseSetupNeeded />;
  if (initializing) return null;
  if (!user) return <AuthScreen onSignUp={handleSignUp} onSignIn={signIn} onResetPassword={resetPassword} />;

  // ── Hard verification gate ───────────────────────────────────────────
  //
  // Signed in but unconfirmed means nothing else renders: no nav, no
  // tabs, no workout screen. Placed ABOVE the profile-loading guard below
  // on purpose — a brand-new account's Firestore doc is still being
  // written at this moment, and making someone stare at a blank screen
  // before being told to check their email would read as the app being
  // broken rather than as a step.
  //
  // `appNotice` rides along because this screen now swallows the only
  // moment it used to appear for a new account: a trainer code that did
  // not resolve is worth knowing at sign-up, not discovered later when
  // the connection silently is not there.
  if (!emailVerified) {
    return (
      <PendingVerificationScreen
        email={user.email}
        notice={appNotice?.tone === 'warning' ? appNotice.message : null}
        onRecheck={refreshEmailVerified}
        onResend={resendVerification}
        onChangeEmail={changeEmail}
        onSignOut={signOut}
      />
    );
  }
  // Auth resolved but the Firestore profile doc hasn't loaded yet (or, very
  // briefly right after signup, is still being written) — same blank frame
  // rather than flashing the wrong role's UI, UNLESS it's actually broken
  // (profileError) or has been stuck long enough that "still loading" isn't
  // a believable explanation anymore (stuckLoading) — either way, someone
  // stuck here before had no way out except force-quitting the app/tab.
  if (profileError || stuckLoading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 px-6 text-center bg-neutral-950 text-neutral-100">
        <p className="text-4xl">🐐</p>
        <p className="text-lg font-semibold">Jimmy tripped over the leash.</p>
        <p className="text-sm text-neutral-400 max-w-xs">
          {profileError
            ? "We couldn't load your profile — try signing out and back in."
            : 'This is taking way longer than it should — try signing out and back in.'}
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

  // ── FORCED RENAME ──────────────────────────────────────────────────────
  //
  // Returned INSTEAD of the router, not layered over it: an overlay leaves
  // the whole app mounted, focusable and one CSS edit from being dismissed,
  // which is not what "cannot be bypassed" means. Same shape as the
  // verification gate above.
  //
  // Placed AFTER `!account` so it cannot flash during the frame where the
  // profile has not loaded and the flag is merely unknown.
  //
  // The client half is convenience; the server half is the rule.
  // `mustChangeUsername` is not in firestore.rules' update allowlist, so
  // nobody can clear their own flag, and claimUsername refuses to accept
  // the name they already have while it is set.
  if (account.mustChangeUsername === true) {
    return <ForcedUsernameModal currentName={account.displayName} onSubmit={updateUsername} onSignOut={signOut} />;
  }

  // ── Consent gate ─────────────────────────────────────────────────────
  //
  // Nobody uses the app without accepting the current Terms and Privacy
  // Policy: sign-up requires the box, and this catches every account from
  // before it did, plus everyone again when LEGAL_VERSION moves. Same
  // replacement shape as the two gates above (hooks/useLegalConsent.js).
  if (legal.needsConsent) {
    return <LegalConsentGate onAccept={legal.accept} onSignOut={signOut} />;
  }

  const isTrainer = account.role === 'trainer';
  // A trainer's tier reflects THEIR own lifting, same as a trainee's.
  // Applied as CSS custom properties so the whole app's accent (buttons,
  // active tab, glowing borders, ambient background) matches how far this
  // person has evolved, tying the rest of the UI back to the AuthScreen
  // showcase. `evolution` is computed up with the hooks above.
  const currentTier = evolution.current;

  return (
    // Two providers over the same tree, stacked flat rather than nested a
    // level deeper: one is about YOU (the goat being drawn everywhere),
    // the other is about everybody else (the ⋯ beside their names).
    <ModerationProvider value={moderation}>
    <JimmyLookProvider evolutionStage={currentTier.stage} account={account}>
      <div
        // `tier-max` unlocks the animated gold backdrop for the top of
        // the evolution ladder — see .tier-max .ambient-bg in index.css
        // and tierIsAnimated in utils/tierTheme.js. Every other tier gets
        // the standard arcade backdrop, which is what makes this one read
        // as a reward.
        className={`relative isolate min-h-[100dvh] bg-neutral-950${tierIsAnimated(currentTier.id) ? ' tier-max' : ''}${tierUp.shaking ? ' screen-shake' : ''}`}
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
          <Suspense fallback={<ScreenFallback />}>
            <Routes>
              <Route
                element={
                  <Layout
                    isTrainer={isTrainer}
                    tierId={currentTier.id}
                    coins={account.coins}
                    unreadNotifications={unreadNotifications}
                    // A chest reward nobody has put on yet — see
                    // utils/storeAlerts.js.
                    unequippedRewards={unequippedRewardCount(account)}
                    onOpenSettings={() => setSettingsOpen(true)}
                    activeWorkout={activeWorkout}
                    // The live rest, for the floating bar. Only the two
                    // values it draws with, not the whole hook — the bar has
                    // no business starting, skipping or extending a rest.
                    restSecondsLeft={rest.secondsLeft}
                    restOverdueSeconds={rest.overdueSeconds}
                    onRestoreWorkout={() => navigate('/workout')}
                  />
                }
              >
                {/* NO `activeWorkout ? <Navigate to="/workout">` here any
                  more. That redirect was the second half of the trap: with
                  a session running, the Workout tab bounced you straight
                  back to the logger, so "go to the home screen" was
                  impossible — and it silently broke the logger's own
                  Minimize button, which navigates here.

                  What the redirect was really protecting is that
                  startWorkout() REPLACES the active session outright. That
                  is now guarded where the damage actually happens (see
                  requestStart below), instead of by making a whole tab
                  unreachable. */}
                <Route
                  index
                  element={
                    <WorkoutHome
                      minStage={minStage}
                      progressionScale={progression}
                      onStartWorkout={handleStartWorkout}
                      onStartAssigned={handleStartAssigned}
                      onStartTemplate={handleStartTemplate}
                      onStartProgram={handleStartProgram}
                      onDeleteTemplate={deleteTemplate}
                      onRecommendTemplate={setRecommendingTemplate}
                      onPlanWorkout={() => setPlanningWorkout(true)}
                      cooldown={workoutCooldown}
                      badges={account?.badges}
                      featuredBadges={account?.featuredBadges}
                      assignments={assignments}
                      templates={templates}
                      workouts={workouts}
                      equippedDance={account.equippedDance}
                      barOverride={tierUp.barOverride}
                      lastWorkoutAt={lastWorkout}
                      bodyWeightKg={bodyWeightKg}
                    />
                  }
                />
                <Route
                  path="progress"
                  element={
                    <ProgressView
                      minStage={minStage}
                      progressionScale={progression}
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
                      workouts={workouts}
                      feedPosts={feed.posts}
                      feedLoading={feed.loading}
                      feedError={feed.error}
                      myUid={uid}
                      myFriendCode={account?.friendCode}
                      friendUids={friendUids}
                      officialFriendUid={officialFriendUid}
                      friends={friendsGraph.friends}
                      incomingRequests={incomingRequests}
                      onSendRequest={friendsGraph.sendFriendRequest}
                      onSendRequestByUid={friendsGraph.sendFriendRequestByUid}
                      onRespond={friendsGraph.respondToFriendRequest}
                      notifications={notifications}
                      onMarkNotificationRead={markNotificationRead}
                      onDismissNotification={dismissNotification}
                      inboxItems={inboxItems}
                      onAcceptInboxItem={workoutInbox.accept}
                      onDeclineInboxItem={workoutInbox.decline}
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
                      onSetFeaturedBadges={setFeaturedBadges}
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
                      // Skips the once-a-day ad cooldown on the reward card.
                      // Same visibility-only flag as the workout cooldown
                      // above; functions/guards.js holds the real exemption.
                      isAdmin={isAdmin}
                    />
                  }
                />
                <Route path="history" element={<HistoryList workouts={workouts} deleteWorkout={deleteWorkout} />} />
                <Route
                  path="workouts/:id"
                  element={
                    <WorkoutDetail workouts={workouts} updateWorkout={updateWorkout} deleteWorkout={deleteWorkout} />
                  }
                />

                {/* Rendering the route at all is conditional, so a
                  non-admin who types /admin gets the app's ordinary
                  "unknown path" redirect home rather than a screen that
                  exists but refuses — one fewer confirmation that the
                  route is there. The data behind it is gated separately
                  and for real (functions/appAdmin.js). */}
                {isAdmin && <Route path="admin" element={<AdminDashboard />} />}

                {isTrainer && (
                  <>
                    <Route
                      path="trainees"
                      element={
                        <TrainerDashboard
                          profile={account}
                          workouts={workouts}
                          minStage={minStage}
                          progressionScale={progression}
                          onSignOut={signOut}
                        />
                      }
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
                {/* INSIDE the Layout route, and that placement is the
                  whole fix. This used to be a SIBLING of it, which
                  meant /workout rendered no <Layout> at all — no
                  BottomNav, so the running-workout screen was the one
                  place in the app with no way out but its own
                  controls. Nothing was "blocking" navigation; the
                  tabs simply were not on the page. Keep this nested.

                  A lifter mid-session can now tap any tab, and the
                  floating bar (rendered by Layout everywhere except
                  here) is how they get back. */}
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
                        onLinkSuperset={linkSuperset}
                        onUnlinkSuperset={unlinkSuperset}
                        // The rest-timer 2× offer — see ActiveWorkoutLogger.
                        // `isAdmin` is the same testing exemption the
                        // cooldown and the Store's ad card get.
                        uid={uid}
                        isAdmin={isAdmin}
                        onBindRestBoost={bindRestBoost}
                        onAddSet={addSet}
                        onAddDropSet={addDropSet}
                        onUpdateSet={updateSet}
                        onRemoveSet={removeSet}
                        onFinish={() => handleFinishWorkout({}, { optimistic: true })}
                        history={workouts}
                        bodyWeightKg={bodyWeightKg}
                        onDiscard={handleDiscardWorkout}
                        // Just navigation — the session keeps running in
                        // App's own state, exactly as it does when a bottom
                        // tab is tapped.
                        onMinimize={() => navigate('/')}
                        // Absent on every account older than the feature, and
                        // absence means on — only turning it off ever writes
                        // the field (see useAuth's setAskForLocker).
                        askForLocker={account.askForLocker !== false}
                        onAnswerLocker={answerLocker}
                        onDisableLockerPrompt={() => setAskForLocker(false)}
                        // The rest countdown itself, not a length to build
                        // one from. This screen still drives it — checking a
                        // set off calls rest.start(), the full-screen timer
                        // calls addTime/dismiss — it just no longer OWNS it,
                        // so navigating away can't destroy a running rest.
                        // See the useRestTimer call in App above.
                        rest={rest}
                      />
                    ) : (
                      <Navigate to="/" replace />
                    )
                  }
                />
              </Route>
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

        {/* ── Step 0: the locker, before any of the celebrating ───────
            First, and on purpose. This is the only genuinely PRACTICAL
            screen in the cascade — it exists to stop somebody leaving
            their kit in a locker they can no longer name — and it used to
            be last, behind the checklist, the trophies and the chest. By
            then the phone has been in a hand for a minute of confetti and
            the lifter is already moving; a modal that arrives at that
            point is an obstacle between them and the door.

            It holds the celebration back rather than racing it: nothing
            below renders until the step advances. The server call is
            already in flight underneath (handleFinishWorkout does not
            await anything to get here), so reading this costs the finish
            no time at all. */}
        {finishFlow?.step === 'locker' && (
          <LockerReminderModal lockerNumber={finishFlow.lockerNumber} onClose={dismissLockerReminder} />
        )}

        {/* ── Phase 1: the celebration, and nothing else on screen ────
            Deliberately the ONLY thing rendered while it plays: every
            prompt below is guarded on the step, which is what the
            redesign is for. */}
        {finishFlow?.step === 'celebration' && (
          <WorkoutCelebration
            exercises={finishFlow.exercises}
            durationMs={finishFlow.durationMs}
            totalVolumeKg={finishFlow.totalVolumeKg}
            personalRecords={finishFlow.personalRecords}
            recommendationBounty={finishFlow.recommendationBounty}
            coinsEarned={finishFlow.coinsEarned}
            coinBoosts={finishFlow.coinBoosts ?? []}
            pending={finishFlow.settled === false}
            onDone={advanceFinishFlow}
          />
        )}

        {/* ── Phase 2a: save this lineup? ─────────────────────────────── */}
        {finishFlow?.step === 'saveRoutine' && !badgeCelebration && !lootboxReward && (
          <Suspense fallback={null}>
            <SaveRoutinePrompt
              defaultName={finishFlow.routineName}
              onSave={(title) => {
                // Straight into the existing "show this on your profile?"
                // sheet, which is what actually writes the template.
                promptSaveTemplate(title, finishFlow.routineExercises);
                advanceFinishFlow();
              }}
              onSkip={advanceFinishFlow}
            />
          </Suspense>
        )}

        {/* ── Phase 2b: which records go on the feed post? ─────────────
            The post is already written, with no records on it — ticking
            here ADDS them (functions/publishRecords.js). Which is why
            "Not now" costs nothing and needs no confirmation. */}
        {finishFlow?.step === 'sharePRs' && !badgeCelebration && !lootboxReward && (
          <Suspense fallback={null}>
            <SharePRsModal
              personalRecords={finishFlow.personalRecords}
              onConfirm={async (ids) => {
                await publishWorkoutRecords(finishFlow.workoutId, ids);
                advanceFinishFlow();
              }}
              onSkip={advanceFinishFlow}
            />
          </Suspense>
        )}

        {planningWorkout && (
          <Suspense fallback={null}>
            <PlanWorkoutModal
              exercises={exercises}
              onSave={promptSaveTemplate}
              onClose={() => setPlanningWorkout(false)}
            />
          </Suspense>
        )}

        {/* "Recommend to a friend" on a saved routine. Only the id crosses
            the wire — recommendWorkout re-reads the routine out of this
            account's own templates server-side, so the copy that lands in
            a friend's inbox cannot be anything this account never saved. */}
        {recommendingTemplate && (
          <Suspense fallback={null}>
            <FriendPickerModal
              routineTitle={recommendingTemplate.title}
              friends={friendsGraph.friends}
              onSend={(friendUid, message) =>
                friendsGraph.recommendWorkout(friendUid, recommendingTemplate.id, message)
              }
              onClose={() => setRecommendingTemplate(null)}
            />
          </Suspense>
        )}

        {/* Asked once, at save time, for each routine. Rendered up here
            with the other global sheets rather than inside
            WorkoutSummaryModal, because that modal has already unmounted
            by the time this needs to appear — it closes as part of
            finishing the workout. */}
        {pendingStart && (
          <ConfirmDialog
            title="Start a new workout?"
            message="You already have one running. Starting another discards it, along with any sets you have already logged."
            confirmLabel="Discard and start"
            cancelLabel="Keep my workout"
            tone="danger"
            onConfirm={() => {
              const begin = pendingStart;
              setPendingStart(null);
              begin();
            }}
            onCancel={() => setPendingStart(null)}
          />
        )}

        {pendingTemplate && (
          <ConfirmDialog
            title="Show this routine on your profile?"
            message="Friends can see the exercises and copy the routine. Weights and reps are always hidden."
            confirmLabel="Yes, show it"
            cancelLabel="Keep it private"
            tone="primary"
            onConfirm={() => resolvePendingTemplate(true)}
            onCancel={() => resolvePendingTemplate(false)}
          />
        )}

        {/* Step 2 of the cascade: trophies, after the tick-list and before
            the chest.

            ── Why every one of these three also asks `!activeWorkout` ──
            They are all queued by showReward() at the END of a workout and
            cleared when they are acknowledged — so a reward nobody tapped
            through outlives the screen that earned it, and the next thing
            it can land on is whatever comes next. Which, for anyone who
            finishes one session and starts another, is the top of the new
            workout: a chest opening over the first warm-up set.

            The queue is deliberately not dropped (the reward is real and
            is owed), it is only held: the moment the new session ends, the
            same guards let it through. Nothing here may ever interrupt a
            workout that is running. */}
        {badgeCelebration && !activeWorkout && !inFinishPhase1 && (
          <BadgeCelebrationModal badgeIds={badgeCelebration} onClaim={() => setBadgeCelebration(null)} />
        )}

        {/* Step 3, and the guards are the whole sequencer: the chest waits
            for BOTH the tick-list and the trophies to clear. Expressing the
            order as render conditions rather than a chain of onClose
            callbacks means no step needs to know what follows it — and
            anything that ever queues a reward early cannot stack a chest
            on top of a half-ticked list. */}
        {lootboxReward && !activeWorkout && !inFinishPhase1 && !badgeCelebration && (
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
              onUpdateAskForLocker={setAskForLocker}
              onUpdateDefaultRestTimer={setDefaultRestTimer}
              onUpdateMascot={setMascot}
              onUpdateRole={setRole}
              isAdmin={isAdmin}
              // The testing floor above. `forcedStage` says whether one is
              // active (so Settings can offer a reset); the bump goes one
              // past whatever tier is currently showing.
              forcedStage={forcedStage}
              onForceEvolve={() => setDebugStage(Math.min(EVOLUTION_TIERS.length, evolution.current.stage + 1))}
              onResetForcedStage={() => setDebugStage(1)}
              // Settings is an overlay, not a route, so it has to close
              // itself on the way out or it would sit on top of the
              // dashboard it just opened.
              onOpenAdmin={() => {
                setSettingsOpen(false);
                navigate('/admin');
              }}
              onClose={() => setSettingsOpen(false)}
            />
          </Suspense>
        )}

        {/* Last child of the page root, and fixed — so it floats over
            every screen and every overlay below it in the tree without
            being inside the max-w-md column that would clip it. See
            components/shared/Toast.jsx for why it is here rather than in
            the flow where the old banner sat. */}
        <Toast notice={appNotice} onDismiss={dismissNotice} />
      </div>
    </JimmyLookProvider>
    </ModerationProvider>
  );
}
