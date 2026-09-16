import { useState } from 'react';
import { enablePushNotifications, disablePushNotifications } from '../../lib/messaging';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import { FITNESS_GOALS, WEEKLY_TARGETS } from '../../utils/onboarding';
import { SELECTABLE_MASCOTS, resolveMascotId } from '../../data/mascots';
import { useJimmyLook } from '../../context/JimmyLook';
import JimmyAvatar from '../evolution/JimmyAvatar';
import { REST_PRESETS, formatRestLabel, normalizeRestSeconds } from '../../utils/restPresets';
import { PRIVACY_POLICY_SECTIONS, TERMS_OF_SERVICE_SECTIONS, LAST_UPDATED } from '../../content/legalContent';
import ConfirmDialog from '../shared/ConfirmDialog';
import LegalDocument from '../legal/LegalDocument';

// A plain on/off switch — same visual language FriendsManager-adjacent
// toggles elsewhere in the app use (a pill track + sliding knob), just
// pulled out here since Settings needed two of them.
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="w-11 h-6 shrink-0 rounded-full flex items-center px-0.5 transition-colors disabled:opacity-50"
      style={{ background: checked ? 'var(--tier-accent)' : 'rgba(255,255,255,0.15)' }}
    >
      <span className={`w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function Row({ label, description, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-base text-neutral-100">{label}</p>
        {description && <p className="text-xs text-neutral-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

// A full-screen-ish overlay reached from the gear icon in TopHud — see
// App.jsx. Everything that used to be "account clutter" on ProfileView
// (sign out, notification/sound toggles, the two editable-with-a-catch
// fields) lives here now, leaving Profile itself just stats + trainer
// connection. `account` is the users/{uid} doc (useAuth), `profile` is
// the meta/profile doc (useCloudProfile) — same two sources ProfileView
// already reads, just both needed here too now that goals editing moved.
export default function SettingsPanel({
  account,
  profile,
  uid,
  onUpdateUsername,
  onUpdateGoals,
  onUpdateDetails,
  onLogBodyWeight,
  onSignOut,
  onDeleteAccount,
  onUpdateSharePRs,
  onUpdateAskForLocker,
  onUpdateMascot,
  onUpdateDefaultRestTimer,
  // Whether to draw the Admin entry at all. A visibility flag, not a
  // permission — see utils/appAdmin.js and functions/appAdmin.js for
  // where the actual boundary is.
  isAdmin = false,
  onOpenAdmin,
  onClose,
}) {
  const keyboardInset = useKeyboardInset();
  const [nameInput, setNameInput] = useState(account.displayName);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState(null);

  const [fitnessGoal, setFitnessGoal] = useState(profile.fitnessGoal);
  const [weeklyTarget, setWeeklyTarget] = useState(profile.weeklyTarget);
  const [confirmingGoals, setConfirmingGoals] = useState(false);
  const goalsChanged = fitnessGoal !== profile.fitnessGoal || weeklyTarget !== profile.weeklyTarget;

  // Height + body weight — the same two vitals collected in the sign-up
  // wizard (OnboardingFlow). They live on meta/profile (heightCm; body
  // weight as the newest entry in bodyWeightLog), so pre-filling from
  // `profile` here IS the sync: whatever you entered at signup shows up,
  // and saving writes back to the same doc the rest of the app reads.
  const currentWeight = profile.bodyWeightLog?.[0]?.weight ?? '';
  const [heightInput, setHeightInput] = useState(profile.heightCm ?? '');
  const [weightInput, setWeightInput] = useState('');

  // Best-effort initial read of the real OS permission — not perfectly in
  // sync with whether THIS device's token is still registered server-side
  // (e.g. it could have been pruned after going stale — see
  // sendPushOnNotificationCreate in functions/index.js), but a solid,
  // synchronous starting point rather than always defaulting to "off" the
  // instant someone who already enabled push opens Settings again.
  const [pushOn, setPushOn] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted',
  );
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState(null);

  const [soundOn, setSoundOn] = useLocalStorage('sound-effects-enabled', true);

  // The value itself lives on `account.sharePRs` (a live Firestore field,
  // via useAuth's own onSnapshot) — no local mirror of it here, unlike
  // pushOn above, which has to track actual OS permission state that
  // Firestore knows nothing about. Only the in-flight call needs state.
  const sharePRs = account.sharePRs === true;
  const [sharePRsBusy, setSharePRsBusy] = useState(false);
  const [sharePRsError, setSharePRsError] = useState(null);

  // The one and only way back from the prompt's own "Don't show this
  // again". Absent on every account predating the feature, and absence
  // means ON — hence `!== false` rather than `=== true`, unlike sharePRs
  // above, which genuinely defaults to off.
  const askForLocker = account.askForLocker !== false;
  const [lockerBusy, setLockerBusy] = useState(false);
  const [lockerError, setLockerError] = useState(null);

  // How long a rest lasts when the app starts one for you (checking a set
  // off). Read through normalizeRestSeconds rather than straight off the
  // doc so an absent field, a null, or a value from an older build all
  // land on 90 and the dropdown always has a matching option selected —
  // a <select> whose value matches no <option> renders blank.
  const restSeconds = normalizeRestSeconds(account.defaultRestTimer);
  const [restBusy, setRestBusy] = useState(false);
  const [restError, setRestError] = useState(null);

  // Which character this account wears. Resolved rather than read straight
  // off the field, so an account that predates `mascot` shows the one its
  // gender already gives it as the selected option — otherwise a user who
  // has been looking at Gena since signup would open Settings and find
  // Jimmy ticked.
  const mascotId = resolveMascotId(account);
  const [mascotBusy, setMascotBusy] = useState(null);
  const [mascotError, setMascotError] = useState(null);
  // The stage is drawn from the same context the rest of the app uses for
  // "your own goat" — legitimate here, since Settings is only ever your
  // own. It means the two cards preview the character at the tier you have
  // actually reached, not a stock stage 1.
  const { evolutionStage } = useJimmyLook();

  // null | 'privacy' | 'terms' — same two documents AuthScreen links to
  // before sign-up, reachable here too so an already-signed-in person can
  // review them anytime without signing out first.
  const [legalDoc, setLegalDoc] = useState(null);

  // Account deletion is the one action here nothing can undo, so it asks for
  // the word typed out rather than a tap that could happen by accident — the
  // same reason the goals change asks for a confirmation it could arguably
  // skip, taken a step further because there is no recovering from this one.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const usernameLocked = account.usernameChangedOnce;

  const handleSaveUsername = async () => {
    setNameError(null);
    setNameBusy(true);
    try {
      await onUpdateUsername(nameInput);
    } catch (err) {
      setNameError(err.message);
    } finally {
      setNameBusy(false);
    }
  };

  const handleConfirmGoals = () => {
    onUpdateGoals({ fitnessGoal, weeklyTarget });
    setConfirmingGoals(false);
  };

  const heightChanged = String(heightInput).trim() !== String(profile.heightCm ?? '');
  const handleSaveHeight = () => {
    const cm = Number(heightInput);
    if (!Number.isFinite(cm) || cm < 50 || cm > 272) return;
    onUpdateDetails({ heightCm: cm });
  };
  const handleSaveWeight = () => {
    const kg = Number(weightInput);
    if (!Number.isFinite(kg) || kg < 20 || kg > 500) return;
    onLogBodyWeight(kg); // adds a new weigh-in entry; visibility defaults private
    setWeightInput('');
  };

  const handleDeleteAccount = async () => {
    setDeleteError(null);
    setDeleteBusy(true);
    try {
      await onDeleteAccount();
      // No navigation or close here on purpose: the Auth user is gone, so
      // the auth listener tears this whole tree down back to sign-in.
    } catch (err) {
      setDeleteError(err.message ?? 'Something went wrong — try again.');
      setDeleteBusy(false);
    }
  };

  const handleToggleSharePRs = async (next) => {
    setSharePRsError(null);
    setSharePRsBusy(true);
    try {
      await onUpdateSharePRs(next);
      // No local setState on success: `account.sharePRs` updates itself the
      // moment the live profile listener sees the server's write, same as
      // every other account field this panel shows.
    } catch (err) {
      setSharePRsError(err.message ?? 'Could not update — try again.');
    } finally {
      setSharePRsBusy(false);
    }
  };

  const handleToggleAskForLocker = async (next) => {
    setLockerError(null);
    setLockerBusy(true);
    try {
      await onUpdateAskForLocker(next);
      // No local setState: `account.askForLocker` is a live Firestore
      // field and the snapshot listener repaints this row itself.
    } catch (err) {
      setLockerError(err.message ?? 'Could not update — try again.');
    } finally {
      setLockerBusy(false);
    }
  };

  const handleChooseMascot = async (next) => {
    if (next === mascotId) return;
    setMascotError(null);
    setMascotBusy(next);
    try {
      await onUpdateMascot(next);
      // No local setState — `account.mascot` is a live Firestore field, so
      // the snapshot listener repaints this row, and every avatar on every
      // other screen, by itself.
    } catch (err) {
      setMascotError(err.message ?? 'Could not switch — try again.');
    } finally {
      setMascotBusy(null);
    }
  };

  const handleChangeRest = async (next) => {
    setRestError(null);
    setRestBusy(true);
    try {
      await onUpdateDefaultRestTimer(next);
      // As with the toggles above: `account.defaultRestTimer` is live, so
      // the snapshot listener repaints the dropdown itself.
    } catch (err) {
      setRestError(err.message ?? 'Could not update — try again.');
    } finally {
      setRestBusy(false);
    }
  };

  const handleTogglePush = async (next) => {
    setPushError(null);
    setPushBusy(true);
    try {
      const result = next ? await enablePushNotifications(uid) : await disablePushNotifications(uid);
      if (result.ok) {
        setPushOn(next);
      } else {
        setPushError(result.reason);
      }
    } finally {
      setPushBusy(false);
    }
  };

  return (
    // Two jobs, one padding value. With no keyboard up, --safe-b lifts
    // the sheet off the home indicator (index.css). With one up, the
    // measured occluded height lifts it clear of the KEYS — otherwise the
    // field being typed into, and the button that submits it, sit
    // underneath them on iOS. The max-height comes down by the same amount
    // so a taller sheet grows upward instead of off the top of the screen.
    // Both are 0 on desktop, where this is a no-op.
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
      style={{ paddingBottom: keyboardInset ? `${keyboardInset}px` : 'var(--safe-b)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl bg-neutral-950 border border-white/10 max-h-[90vh] overflow-y-auto"
        style={keyboardInset ? { maxHeight: `calc(90vh - ${keyboardInset}px)` } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-neutral-950 flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/10">
          <h2 className="text-xl font-bold text-neutral-50">Settings</h2>
          <button type="button" onClick={onClose} className="text-neutral-500 text-2xl leading-none px-1">
            ✕
          </button>
        </div>

        <div className="px-5 pb-8 flex flex-col divide-y divide-white/10">
          <section className="py-4 flex flex-col gap-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Username</p>
            {usernameLocked ? (
              <>
                <p className="text-base text-neutral-100">{account.displayName}</p>
                <p className="text-xs text-neutral-500">You've already used your one-time username change.</p>
              </>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    maxLength={40}
                    className="flex-1 bg-neutral-800 rounded-xl px-3.5 py-3 text-base text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[var(--ember)]"
                  />
                  <button
                    type="button"
                    onClick={handleSaveUsername}
                    disabled={nameBusy || !nameInput.trim() || nameInput.trim() === account.displayName}
                    className="bg-[var(--ember)] text-white font-semibold text-base px-5 rounded-xl disabled:opacity-50"
                  >
                    {nameBusy ? 'Saving…' : 'Save'}
                  </button>
                </div>
                <p className="text-xs text-amber-400 flex items-start gap-1">
                  <span>⚠️</span>
                  <span>You can only change your username once — choose carefully.</span>
                </p>
                {nameError && <p className="text-xs text-[var(--danger)]">{nameError}</p>}
              </>
            )}
          </section>

          <section className="py-4 flex flex-col gap-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Goals</p>
            <div>
              <p className="text-sm text-neutral-500 mb-1.5">Fitness Goal</p>
              <div className="grid grid-cols-2 gap-2">
                {FITNESS_GOALS.map((goal) => {
                  const active = fitnessGoal === goal.id;
                  return (
                    <button
                      key={goal.id}
                      type="button"
                      onClick={() => setFitnessGoal(active ? '' : goal.id)}
                      className={`py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-1.5 ${
                        active ? 'text-white' : 'bg-neutral-800 text-neutral-400'
                      }`}
                      style={active ? { background: 'var(--tier-accent)', color: '#000' } : undefined}
                    >
                      <span>{goal.icon}</span> {goal.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-sm text-neutral-500 mb-1.5">Weekly Workout Target</p>
              <div className="grid grid-cols-6 gap-1.5">
                {WEEKLY_TARGETS.map((n) => {
                  const active = weeklyTarget === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setWeeklyTarget(active ? '' : n)}
                      className={`py-2.5 rounded-xl text-sm font-semibold transition ${
                        active ? 'text-white' : 'bg-neutral-800 text-neutral-400'
                      }`}
                      style={active ? { background: 'var(--tier-accent)', color: '#000' } : undefined}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfirmingGoals(true)}
              disabled={!goalsChanged}
              className="bg-[var(--ember)] text-white font-semibold text-base py-3 rounded-xl disabled:opacity-40"
            >
              Save Goals
            </button>
          </section>

          <section className="py-4 flex flex-col gap-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Body</p>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-neutral-500">Height (cm)</span>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={heightInput}
                  onChange={(e) => setHeightInput(e.target.value)}
                  placeholder="e.g. 178"
                  className="flex-1 bg-neutral-800 rounded-xl px-3.5 py-3 text-base text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[var(--ember)]"
                />
                <button
                  type="button"
                  onClick={handleSaveHeight}
                  disabled={!heightChanged || !Number(heightInput)}
                  className="bg-[var(--ember)] text-white font-semibold text-base px-5 rounded-xl disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-neutral-500">
                Body weight (kg){currentWeight !== '' && ` — currently ${currentWeight}`}
              </span>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  placeholder={currentWeight !== '' ? String(currentWeight) : 'e.g. 75.5'}
                  className="flex-1 bg-neutral-800 rounded-xl px-3.5 py-3 text-base text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[var(--ember)]"
                />
                <button
                  type="button"
                  onClick={handleSaveWeight}
                  disabled={!Number(weightInput)}
                  className="bg-[var(--ember)] text-white font-semibold text-base px-5 rounded-xl disabled:opacity-40"
                >
                  Save
                </button>
              </div>
              <span className="text-xs text-neutral-500">
                Powers your strength-relative score. Full history lives on your Profile.
              </span>
            </label>
          </section>

          <section className="py-1 flex flex-col">
            <Row label="Push Notifications" description={pushError ?? 'Weigh-in reminders, trainer updates.'}>
              <Toggle checked={pushOn} onChange={handleTogglePush} disabled={pushBusy} />
            </Row>
            <Row label="Sound Effects" description="Rest-timer beep.">
              <Toggle checked={soundOn} onChange={setSoundOn} />
            </Row>
            <Row
              label="Default Rest Time"
              description={restError ?? 'How long the timer runs after you check off a set.'}
            >
              {/* A native <select> on purpose: eight options is too many
                  for segmented buttons at 375px, and the platform picker
                  is a one-thumb wheel on iOS and a full-height list on
                  Android — both better than anything rebuilt here. */}
              <select
                value={restSeconds}
                disabled={restBusy}
                onChange={(e) => handleChangeRest(Number(e.target.value))}
                aria-label="Default rest time"
                className="bg-neutral-800 rounded-lg text-sm text-neutral-200 px-2.5 py-1.5 focus:outline-none disabled:opacity-40"
              >
                {/* A value that isn't one of the presets (set on another
                    build, or by hand) still needs an option to sit in, or
                    the control renders empty and looks broken. */}
                {(REST_PRESETS.includes(restSeconds) ? REST_PRESETS : [...REST_PRESETS, restSeconds].sort((a, b) => a - b)).map(
                  (seconds) => (
                    <option key={seconds} value={seconds}>
                      {formatRestLabel(seconds)}
                    </option>
                  ),
                )}
              </select>
            </Row>
            <Row label="Share PRs with Friends" description={sharePRsError ?? "Let friends see your all-time bests on your profile."}>
              <Toggle checked={sharePRs} onChange={handleToggleSharePRs} disabled={sharePRsBusy} />
            </Row>
            <Row
              label="Ask for Locker Number"
              description={lockerError ?? 'Jimmy reminds you where your stuff is when you finish.'}
            >
              <Toggle checked={askForLocker} onChange={handleToggleAskForLocker} disabled={lockerBusy} />
            </Row>

            {/* ── ADMIN-ONLY, TEMPORARILY ────────────────────────────────────

                Gated on `isAdmin` — the same App-level check that shows the
                Analytics Dashboard below — while Gena has no dances and no
                accessories of her own. Rendered conditionally rather than
                hidden with CSS, for the same reason GymShop filters its
                shelves instead of styling them away: a card that is merely
                invisible still takes keyboard focus and still has an
                onClick that writes to Firestore.

                This hides the PICKER, not the character. A `mascot` write is
                still permitted by firestore.rules, and resolveMascotId still
                gives Gena to anyone whose gender is female — so if the
                backfill runs while this is gated, those accounts get Gena
                with no way back to Jimmy. Ungate this before, or with, that
                deploy.

                Delete the guard (leaving the block) when her assets land. */}
            {isAdmin && (
              // Two cards rather than the Toggle above, for one reason: a
              // switch would have to be labelled with one of the two names
              // ("Gena?") and would make the other the unnamed default,
              // which is not what a choice between two characters is. The
              // cards also show each one AT YOUR TIER wearing YOUR GEAR, so
              // the decision is made by looking rather than by reading —
              // and Gena's accessory placement is her own (see
              // GENA_ACCESSORY_LAYOUT), which is exactly the difference a
              // preview should be showing.
              <div className="py-3">
                <p className="text-base text-neutral-100">Your Mascot</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {mascotError ?? 'Who shows up for your workouts. Changes everywhere, including your feed posts from here on.'}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Your mascot">
                  {SELECTABLE_MASCOTS.map((character) => {
                    const active = character.id === mascotId;
                    return (
                      <button
                        key={character.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={Boolean(mascotBusy)}
                        onClick={() => handleChooseMascot(character.id)}
                        className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-3 transition active:scale-[0.98] disabled:opacity-50 ${
                          active
                            ? 'border-[var(--tier-accent)] bg-white/10'
                            : 'border-white/10 bg-white/5'
                        }`}
                      >
                        <JimmyAvatar
                          evolutionStage={evolutionStage}
                          equippedAccessories={account}
                          mascot={character.id}
                          size={84}
                          alt={character.name}
                        />
                        <span
                          className={`text-sm font-semibold ${active ? 'text-neutral-50' : 'text-neutral-400'}`}
                        >
                          {mascotBusy === character.id ? 'Switching…' : character.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {isAdmin && (
            <section className="py-4 flex flex-col gap-1">
              <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-1">Admin</p>
              <button
                type="button"
                onClick={onOpenAdmin}
                className="flex items-center justify-between text-left text-sm text-neutral-300 py-1.5"
              >
                <span>Analytics Dashboard</span>
                <span aria-hidden="true" className="text-neutral-600">&rsaquo;</span>
              </button>
            </section>
          )}

          <section className="py-4 flex flex-col gap-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-1">Legal</p>
            <button type="button" onClick={() => setLegalDoc('privacy')} className="text-left text-sm text-neutral-300 py-1.5">
              Privacy Policy
            </button>
            <button type="button" onClick={() => setLegalDoc('terms')} className="text-left text-sm text-neutral-300 py-1.5">
              Terms of Service
            </button>
          </section>

          <section className="pt-4 flex flex-col gap-3">
            <button
              type="button"
              onClick={onSignOut}
              className="w-full text-center text-sm font-semibold text-[var(--danger)] py-2"
            >
              Sign Out
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteInput('');
                setDeleteError(null);
                setConfirmingDelete(true);
              }}
              className="w-full text-center text-xs text-neutral-500 py-1"
            >
              Delete my account
            </button>
          </section>
        </div>
      </div>

      {confirmingGoals && (
        <ConfirmDialog
          title="Change your goals?"
          message="Are you sure you want to change your goals?"
          confirmLabel="Yes, Update"
          onConfirm={handleConfirmGoals}
          onCancel={() => setConfirmingGoals(false)}
        />
      )}

      {confirmingDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-5"
          onClick={() => !deleteBusy && setConfirmingDelete(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-neutral-950 border border-[var(--danger)]/40 p-5 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-neutral-50">Delete your account?</h3>
            <p className="text-sm text-neutral-400">
              This erases your profile, every workout you've logged, your templates, your coins and
              everything you've bought, and removes you from your friends' lists. It cannot be undone.
            </p>
            <label className="text-xs text-neutral-500" htmlFor="delete-confirm">
              Type <span className="font-bold text-neutral-300">DELETE</span> to confirm
            </label>
            <input
              id="delete-confirm"
              type="text"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              autoComplete="off"
              className="bg-neutral-800 rounded-xl px-3.5 py-3 text-base text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[var(--danger)]"
            />
            {deleteError && <p className="text-xs text-[var(--danger)]">{deleteError}</p>}
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleteBusy}
                className="flex-1 bg-neutral-800 text-neutral-200 font-semibold py-3 rounded-xl disabled:opacity-50"
              >
                Keep my account
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteBusy || deleteInput.trim().toUpperCase() !== 'DELETE'}
                className="flex-1 bg-[var(--danger)] text-white font-semibold py-3 rounded-xl disabled:opacity-40"
              >
                {deleteBusy ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}

      {legalDoc === 'privacy' && (
        <LegalDocument
          title="Privacy Policy"
          sections={PRIVACY_POLICY_SECTIONS}
          lastUpdated={LAST_UPDATED}
          onClose={() => setLegalDoc(null)}
        />
      )}
      {legalDoc === 'terms' && (
        <LegalDocument
          title="Terms of Service"
          sections={TERMS_OF_SERVICE_SECTIONS}
          lastUpdated={LAST_UPDATED}
          onClose={() => setLegalDoc(null)}
        />
      )}
    </div>
  );
}
