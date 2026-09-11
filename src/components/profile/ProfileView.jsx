import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pushNotification } from '../../hooks/useNotifications';
import { WEEKDAY_LABELS, isWeighInDayToday, isWeighInDayTomorrow, goalMatchesDelta } from '../../utils/weighIn';
import WeighInModal from './WeighInModal';
import BadgeShelf from './BadgeShelf';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

// `account` is the Firestore auth/role doc from useAuth() — distinct from
// `profile`, which is the users/{uid}/meta/profile doc (useCloudProfile,
// now lifted to App.jsx so SettingsPanel can share it for goals editing —
// see App.jsx). Kept as two separate sources since one is per-device-ish
// personal data and the other is identity/role.
//
// Deliberately stats-only now — username editing, goals editing,
// notification/sound toggles, and sign-out all moved to SettingsPanel
// (reached via the gear icon in TopHud) so this stays what its own
// heading says: your numbers, not app preferences.
export default function ProfileView({ account, profile, updateDetails, logBodyWeight, deleteBodyWeightEntry, onConnectToTrainer, onDisconnectFromTrainer }) {
  const navigate = useNavigate();
  const [weightInput, setWeightInput] = useState('');
  const [trainerCodeInput, setTrainerCodeInput] = useState('');
  const [connectError, setConnectError] = useState(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [pendingWeighIn, setPendingWeighIn] = useState(null); // { weight, deltaKg, achieved }
  // Two-step rather than a single tap: it cancels a real relationship and
  // deletes the coach's assigned workouts, and there is no undo short of
  // asking for their code again.
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [disconnectError, setDisconnectError] = useState(null);

  const handleDisconnect = async () => {
    setDisconnectError(null);
    setDisconnectBusy(true);
    try {
      await onDisconnectFromTrainer();
      setConfirmingDisconnect(false);
    } catch (err) {
      setDisconnectError(err.message ?? 'Could not disconnect — try again.');
    } finally {
      setDisconnectBusy(false);
    }
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!trainerCodeInput.trim()) return;
    setConnectError(null);
    setConnectBusy(true);
    try {
      await onConnectToTrainer(trainerCodeInput);
      setTrainerCodeInput('');
    } catch (err) {
      setConnectError(err.message);
    } finally {
      setConnectBusy(false);
    }
  };

  // Logging a weight doesn't save immediately — it queues a confirmation
  // step (WeighInModal) so the visibility choice happens right when the
  // number that choice is ABOUT is fresh on screen, same reasoning
  // WorkoutSummaryModal's "save as template" prompt uses.
  const handleLogWeight = (e) => {
    e.preventDefault();
    if (!weightInput) return;
    const weight = Number(weightInput);
    const previous = profile.bodyWeightLog[0]?.weight;
    const deltaKg = previous != null ? weight - previous : null;
    const achieved = goalMatchesDelta(profile.fitnessGoal, deltaKg);
    setPendingWeighIn({ weight, deltaKg, achieved });
  };

  const handleConfirmWeighIn = (visibility) => {
    const { weight, deltaKg, achieved } = pendingWeighIn;
    logBodyWeight(weight, visibility);

    // The trainer is updated on EVERY weigh-in, regardless of the public/
    // private choice above — that toggle only ever controls the wider
    // "activity" visibility (see WeighInModal), never trainer visibility,
    // which already works this way for body weight in general.
    if (account?.trainerId) {
      const amount = deltaKg != null ? `${Math.abs(deltaKg).toFixed(1)} kg` : null;
      const direction = deltaKg > 0 ? 'up' : deltaKg < 0 ? 'down' : null;
      pushNotification(account.trainerId, {
        type: 'trainee_weigh_in',
        title: `${account.displayName} logged a weigh-in`,
        body: achieved
          ? `Progress toward their goal: ${amount} ${direction}. Now ${weight} kg.`
          : amount
            ? `${weight} kg (${amount} ${direction} from last time).`
            : `First weigh-in logged: ${weight} kg.`,
        data: { traineeId: account.id },
      });
    }

    setPendingWeighIn(null);
    setWeightInput('');
  };

  const latestWeight = profile.bodyWeightLog[0]?.weight;
  const weighInToday = isWeighInDayToday(profile.weighInDay);
  const weighInTomorrow = isWeighInDayTomorrow(profile.weighInDay);

  return (
    <div className="flex flex-col gap-6 pt-6 pb-24">
      <div>
        <button type="button" onClick={() => navigate(-1)} className="text-sm text-neutral-500 mb-1">
          ← Back
        </button>
        <h1 className="text-3xl font-bold text-neutral-50">Profile</h1>
      </div>

      {(weighInToday || weighInTomorrow) && (
        <div className="card p-4 flex items-center gap-3" style={{ borderColor: 'var(--tier-accent)' }}>
          <span className="text-2xl">{weighInToday ? '⏰' : '📅'}</span>
          <p className="text-sm text-neutral-200 flex-1">
            {weighInToday
              ? "It's your weigh-in day — log your weight below to keep your streak going."
              : 'Weigh-in day is tomorrow — a heads up so it doesn\'t sneak up on you.'}
          </p>
        </div>
      )}

      {account && (
        <section className="card p-5 flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">{account.displayName}</h2>
            <p className="text-sm text-neutral-500">{account.email}</p>
          </div>

          {account.role === 'trainer' ? (
            <p className="text-sm text-neutral-500">
              Your trainer code: <span className="text-neutral-100 font-semibold tracking-widest">{account.trainerCode}</span>
            </p>
          ) : account.trainerId ? (
            <div className="flex flex-col gap-1.5 items-start">
              <p className="text-sm text-[var(--success)]">✓ Connected to your coach</p>
              {confirmingDisconnect ? (
                <>
                  <p className="text-xs text-neutral-400">
                    Your coach will stop seeing your workouts and weigh-ins, and any workouts they
                    assigned you will be removed. Your own history stays.
                  </p>
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      disabled={disconnectBusy}
                      className="text-xs font-semibold text-[var(--danger)] disabled:opacity-50"
                    >
                      {disconnectBusy ? 'Disconnecting…' : 'Yes, disconnect'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDisconnect(false)}
                      disabled={disconnectBusy}
                      className="text-xs text-neutral-500"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => { setDisconnectError(null); setConfirmingDisconnect(true); }}
                  className="text-xs text-neutral-500 underline underline-offset-2"
                >
                  Disconnect from my coach
                </button>
              )}
              {disconnectError && <p className="text-xs text-[var(--danger)]">{disconnectError}</p>}
            </div>
          ) : (
            <form onSubmit={handleConnect} className="flex flex-col gap-2">
              <span className="text-sm text-neutral-500">Have a trainer code? Connect below.</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={trainerCodeInput}
                  onChange={(e) => setTrainerCodeInput(e.target.value)}
                  placeholder="e.g. AB12CD"
                  className="flex-1 bg-neutral-800 rounded-xl px-3.5 py-3 text-base text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[var(--ember)]"
                />
                <button
                  type="submit"
                  disabled={connectBusy}
                  className="bg-[var(--ember)] text-white font-semibold text-base px-5 rounded-xl disabled:opacity-50"
                >
                  Connect
                </button>
              </div>
              {connectError && <p className="text-sm text-[var(--danger)]">{connectError}</p>}
            </form>
          )}
        </section>
      )}

      <BadgeShelf badges={account?.badges} />

      <section className="card p-5 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-neutral-100">Details</h2>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-neutral-500">Height (cm)</span>
          <input
            type="number"
            inputMode="numeric"
            value={profile.heightCm}
            onChange={(e) => updateDetails({ heightCm: e.target.value })}
            placeholder="e.g. 178"
            className="bg-neutral-800 rounded-xl px-3.5 py-3 text-base text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[var(--ember)]"
          />
        </label>

        <div>
          <p className="text-sm text-neutral-500 mb-1.5">Weekly Weigh-In Day</p>
          <div className="grid grid-cols-4 gap-1.5">
            {WEEKDAY_LABELS.map((label, i) => {
              const active = profile.weighInDay === i;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => updateDetails({ weighInDay: active ? '' : i })}
                  className={`py-2.5 rounded-xl text-xs font-semibold transition ${
                    active ? 'text-white' : 'bg-neutral-800 text-neutral-400'
                  }`}
                  style={active ? { background: 'var(--tier-accent)', color: '#000' } : undefined}
                >
                  {label.slice(0, 3)}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-neutral-500 mt-1.5">
            You'll get a reminder the day before and again that morning (turn push on in Settings).
          </p>
        </div>
      </section>

      <section className="card p-5 flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-neutral-100">Body Weight</h2>
          {latestWeight && (
            <span className="text-sm text-neutral-400">
              Current: <span className="text-neutral-100 font-semibold">{latestWeight} kg</span>
            </span>
          )}
        </div>

        <form onSubmit={handleLogWeight} className="flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            placeholder="Enter weight in kg"
            className="flex-1 bg-neutral-800 rounded-xl px-3.5 py-3 text-base text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[var(--ember)]"
          />
          <button type="submit" className="bg-[var(--ember)] text-white font-semibold text-base px-5 rounded-xl">
            Save
          </button>
        </form>

        {profile.bodyWeightLog.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {profile.bodyWeightLog.slice(0, 8).map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between text-base bg-white/10 border border-white/10 rounded-xl px-3.5 py-2.5"
              >
                <span className="text-neutral-500 flex items-center gap-1.5">
                  {formatDate(entry.date)}
                  {entry.visibility === 'public' && <span title="Public">📢</span>}
                </span>
                <span className="text-neutral-100 font-semibold tabular-nums">{entry.weight} kg</span>
                <button
                  type="button"
                  onClick={() => deleteBodyWeightEntry(entry.id)}
                  className="text-neutral-600 px-1"
                  aria-label="Delete entry"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pendingWeighIn && (
        <WeighInModal
          deltaKg={pendingWeighIn.deltaKg}
          achieved={pendingWeighIn.achieved}
          onConfirm={handleConfirmWeighIn}
          onClose={() => handleConfirmWeighIn('private')}
        />
      )}
    </div>
  );
}
