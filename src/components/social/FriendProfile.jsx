import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFriendProfile } from '../../hooks/useFriendProfile';
import { getEvolutionProgress } from '../../utils/evolutionTiers';
import { STORE_ITEMS } from '../../data/storeItems';
import GradientBorder from '../shared/GradientBorder';
import NudgeModal from './NudgeModal';

const ITEMS_BY_ID = new Map(STORE_ITEMS.map((item) => [item.id, item]));

function Avatar({ tierId, emoji, image }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-4xl">
        {emoji}
      </span>
    );
  }
  return (
    <GradientBorder tierId={tierId} shape="circle" fillClassName="rounded-full overflow-hidden" className="shrink-0">
      <img src={image} alt="" onError={() => setBroken(true)} className="h-20 w-20 object-cover object-top bg-neutral-800" />
    </GradientBorder>
  );
}

// Reached from FriendsManager's friend list. Everything here is read-only —
// there's nothing to edit about someone else's profile — and everything on
// it comes from data this friend has already made public one way or
// another; see useFriendProfile.js for exactly which two sources and why
// their real users/{uid} doc is never read directly.
export default function FriendProfile({ friends, onSendNudge }) {
  const { friendUid } = useParams();
  const navigate = useNavigate();
  const knownFriend = friends.find((f) => f.uid === friendUid);
  const [nudging, setNudging] = useState(false);
  const {
    displayName,
    lifetimeVolume,
    sharePRs,
    personalRecords,
    equippedAccessory,
    loading,
    hasSummary,
  } = useFriendProfile(friendUid);

  // The friends-list name is available immediately (no round trip); the
  // published summary's copy is preferred once it arrives since it's the
  // more current source of truth, but until then this avoids a blank
  // header while the doc is still loading.
  const name = displayName ?? knownFriend?.displayName ?? 'This friend';
  const { current } = getEvolutionProgress(lifetimeVolume);
  const accessory = equippedAccessory ? ITEMS_BY_ID.get(equippedAccessory) : null;

  if (!loading && !hasSummary) {
    // Precisely the person a nudge exists for — someone with nothing to
    // show here BECAUSE they haven't started — so this early return still
    // gets the button, not just the fully-populated view below it.
    return (
      <div className="pt-6 pb-24 flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-neutral-500">
          {name} hasn't logged a workout yet — nothing to show here so far.
        </p>
        <button
          type="button"
          onClick={() => setNudging(true)}
          className="bg-[var(--ember)] text-white font-semibold text-sm px-5 py-2.5 rounded-xl"
        >
          🐐 Nudge
        </button>
        <button type="button" onClick={() => navigate(-1)} className="text-sm font-medium text-[var(--ember)]">
          Back
        </button>
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

  return (
    <div className="flex flex-col gap-5 pt-6 pb-24">
      <button type="button" onClick={() => navigate(-1)} className="text-sm font-medium text-neutral-500 self-start">
        ← Back
      </button>

      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar tierId={current.id} emoji={current.emoji} image={current.image} />
        <div>
          <h1 className="text-2xl font-bold text-neutral-50">{name}</h1>
          <p className="text-sm text-neutral-500">{current.label}</p>
        </div>
        {accessory && (
          <span className="inline-flex items-center gap-1.5 text-sm text-neutral-400 bg-white/5 border border-white/10 rounded-full px-3 py-1">
            <span className="text-base">{accessory.emoji}</span> {accessory.name}
          </span>
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
        <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Personal Records</p>
        {sharePRs ? (
          personalRecords && personalRecords.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {personalRecords
                .slice()
                .sort((a, b) => b.weight - a.weight)
                .map((pr) => (
                  <li key={pr.exerciseId} className="flex items-center justify-between text-base">
                    <span className="text-neutral-300">{pr.name}</span>
                    <span className="font-semibold text-neutral-100 tabular-nums">
                      {pr.weight} kg × {pr.reps}
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">No personal records logged yet.</p>
          )
        ) : (
          <p className="text-sm text-neutral-500">{name} hasn't chosen to share their PRs.</p>
        )}
      </section>

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
