import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFriendProfile } from '../../hooks/useFriendProfile';
import { sanitizeFriendData } from '../../utils/friendPrivacy';
import { getStoreItem } from '../../data/storeItems';
import { AccessoryIcon } from '../evolution/accessoryArt';
import JimmyAvatar from '../evolution/JimmyAvatar';
import GradientBorder from '../shared/GradientBorder';
import NudgeModal from './NudgeModal';

// Someone else's profile. Read-only by construction — there is nothing here
// to edit, and nothing here that they have not published.
//
// The view never touches the hook's return value directly. Everything goes
// through sanitizeFriendData first, so this file cannot render a field that
// the allowlist has not been taught about. See utils/friendPrivacy.js for
// what that does and does not protect against — in short, the real fence is
// firestore.rules plus functions/publicProfile.js, and this is the second
// one behind it.

function MysteryProgress({ percent, nextTierLabel, isMaxTier, name }) {
  if (isMaxTier) {
    return (
      <div className="flex flex-col gap-2">
        <div className="h-2 w-full rounded-full bg-[var(--success)]/25 overflow-hidden">
          <div className="h-full w-full rounded-full bg-[var(--success)]" />
        </div>
        <p className="text-xs text-neutral-500">Fully evolved. There is nothing left to chase.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${percent}%`, background: 'var(--tier-accent)' }}
          // The bar is the only quantity on screen, and the label below it
          // is deliberately vague. A friend gets to see that someone is
          // close to evolving without being handed a number to measure
          // themselves against — which is the entire point of the screen.
          role="img"
          aria-label={`${name} is on the way to ${nextTierLabel}`}
        />
      </div>
      <p className="text-xs text-neutral-500">
        Approaching <span className="text-neutral-300 font-medium">{nextTierLabel}</span>…
      </p>
    </div>
  );
}

function RoutineCard({ routine }) {
  return (
    <div className="card p-4 flex flex-col gap-2">
      <p className="text-sm font-semibold text-neutral-100">{routine.name}</p>
      <ul className="flex flex-col gap-1">
        {routine.exercises.map((exercise, i) => (
          <li key={exercise.id ?? `${exercise.name}-${i}`} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-neutral-300">{exercise.name}</span>
            <span className="text-neutral-500 tabular-nums whitespace-nowrap">
              {exercise.setCount} × {formatReps(exercise.repRange)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatReps(range) {
  if (!range) return '—';
  return range.low === range.high ? `${range.low}` : `${range.low}-${range.high}`;
}

export default function PublicFriendProfile({ friends, onSendNudge }) {
  const { friendUid } = useParams();
  const navigate = useNavigate();
  const knownFriend = friends.find((f) => f.uid === friendUid);
  const [nudging, setNudging] = useState(false);

  const raw = useFriendProfile(friendUid);
  const friend = sanitizeFriendData(raw);

  // The friends-list name arrives with no round trip; the published one is
  // preferred once it lands, since it is the more current source of truth.
  const name = friend.displayName ?? knownFriend?.displayName ?? 'This friend';

  if (raw.loading) {
    return (
      <div className="flex flex-col gap-5 pt-6 pb-24">
        <p className="text-sm text-neutral-500">Loading {name}'s profile…</p>
      </div>
    );
  }

  if (!raw.hasSummary) {
    return (
      <div className="flex flex-col gap-5 pt-6 pb-24">
        <button type="button" onClick={() => navigate(-1)} className="text-sm font-medium text-neutral-500 self-start">
          ← Back
        </button>
        <p className="text-sm text-neutral-500">
          {name} hasn't logged a workout yet, so there's nothing to show here.
        </p>
        {nudging && (
          <NudgeModal
            friendName={name}
            onSend={(messageId) => onSendNudge(friendUid, messageId)}
            onClose={() => setNudging(false)}
          />
        )}
      </div>
    );
  }

  const worn = friend.equippedAccessories.map((id) => getStoreItem(id)).filter(Boolean);

  return (
    <div className="flex flex-col gap-5 pt-6 pb-24">
      <button type="button" onClick={() => navigate(-1)} className="text-sm font-medium text-neutral-500 self-start">
        ← Back
      </button>

      <div className="flex flex-col items-center gap-3 text-center">
        {/* THEIR goat in THEIR gear — explicit props, never useJimmyLook().
            Reading the current user's context here would quietly dress every
            friend in your own loadout, and it would look entirely plausible. */}
        <GradientBorder tierId={friend.tierId} shape="circle" fillClassName="rounded-full overflow-hidden" className="shrink-0">
          <JimmyAvatar
            evolutionStage={friend.evolutionStage}
            equippedAccessories={friend.equippedAccessories}
            crop="head"
            size={96}
            className="bg-neutral-800"
            alt={`${name} the ${friend.tierLabel}`}
          />
        </GradientBorder>

        <div>
          <h1 className="text-2xl font-bold text-neutral-50">{name}</h1>
          <p className="text-sm text-neutral-500">{friend.tierLabel}</p>
        </div>

        {worn.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {worn.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1.5 text-sm text-neutral-400 bg-white/5 border border-white/10 rounded-full px-3 py-1"
              >
                <AccessoryIcon itemId={item.id} className="h-4 w-4" /> {item.name}
              </span>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setNudging(true)}
          className="mt-1 bg-[var(--ember)] text-white font-semibold text-sm px-5 py-2.5 rounded-xl"
        >
          🐐 Nudge
        </button>
      </div>

      <section className="card p-5 flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Evolution</p>
        <MysteryProgress
          percent={friend.progressPercent}
          nextTierLabel={friend.nextTierLabel}
          isMaxTier={friend.isMaxTier}
          name={name}
        />
      </section>

      <section className="card p-5 flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Personal Records</p>
        {!friend.sharesRecords ? (
          <p className="text-sm text-neutral-500">{name} hasn't chosen to share their PRs.</p>
        ) : friend.personalRecords.length === 0 ? (
          <p className="text-sm text-neutral-500">No personal records logged yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {friend.personalRecords
              .slice()
              .sort((a, b) => b.weight - a.weight)
              .map((pr) => (
                <li key={pr.exerciseId ?? pr.name} className="flex items-center justify-between text-base">
                  <span className="text-neutral-300">{pr.name}</span>
                  <span className="font-semibold text-neutral-100 tabular-nums">
                    {pr.weight} kg{pr.reps ? ` × ${pr.reps}` : ''}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>

      {/* Routines are structure only — see sanitizeRoutine. Nothing here
          renders until the server actually publishes saved workouts, which
          it does not today: templates live at users/{uid}/templates and are
          owner-only by rule. The section stays because the sanitiser and
          the UI for it are the parts that need to exist BEFORE any such
          data is published, not after. */}
      {friend.savedRoutines.length > 0 && (
        <section className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Saved Routines</p>
          <p className="text-xs text-neutral-600 -mt-1">
            Structure only — steal the routine, not the numbers.
          </p>
          <div className="flex flex-col gap-3">
            {friend.savedRoutines.map((routine, i) => (
              <RoutineCard key={routine.id ?? `${routine.name}-${i}`} routine={routine} />
            ))}
          </div>
        </section>
      )}

      {nudging && (
        <NudgeModal
          friendName={name}
          onSend={(messageId) => onSendNudge(friendUid, messageId)}
          onClose={() => setNudging(false)}
        />
      )}
    </div>
  );
}
