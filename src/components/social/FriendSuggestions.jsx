import { useRef, useState } from 'react';
import { sanitizeFriendData } from '../../utils/friendPrivacy';
import GradientBorder from '../shared/GradientBorder';
import JimmyAvatar from '../evolution/JimmyAvatar';

// "People you might know" — a horizontal carousel of friends-of-friends.
//
// Each suggestion goes through sanitizeFriendData, the same allowlist a
// friend's profile uses, rather than being read field-by-field here. These
// are people you are NOT connected to yet, so if there is one screen in
// the app where a newly-added public/summary field should NOT appear by
// accident, it is this one. Reusing the fence also means the tier maths
// (volume → stage → label) has one implementation, not two.
//
// Same scroll idiom as WorkoutHome's mission carousel: negative margins so
// the row bleeds to the screen edge while the cards keep the page's
// padding, and scroll-snap so a flick parks on a card.

function mutualLabel({ mutualCount, mutualNames }) {
  if (!mutualCount) return 'Suggested for you';
  const [first] = mutualNames ?? [];
  if (!first) return `${mutualCount} mutual friend${mutualCount === 1 ? '' : 's'}`;
  if (mutualCount === 1) return `Friends with ${first}`;
  return `${first} + ${mutualCount - 1} other${mutualCount - 1 === 1 ? '' : 's'}`;
}

function SuggestionCard({ suggestion, onAdd }) {
  const person = sanitizeFriendData(suggestion);
  const [state, setState] = useState('idle'); // idle | sending | sent | failed

  // A ref, not the state, because three fast taps all read the same stale
  // `state` from the closure they were created in and all three would fire
  // a request. The ref is shared mutable state and latches on the first.
  const inFlight = useRef(false);

  const handleAdd = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState('sending');
    navigator.vibrate?.([30]);
    try {
      await onAdd(suggestion.uid);
      setState('sent');
    } catch {
      setState('failed');
      // Only the failure path unlatches: a sent request must not be
      // re-sendable from the same card.
      inFlight.current = false;
    }
  };

  const label = { idle: 'Add friend', sending: 'Sending…', sent: '✓ Requested', failed: 'Try again' }[state];
  const tone =
    state === 'sent'
      ? 'bg-[var(--success)]/15 border-[var(--success)]/30 text-[var(--success)]'
      : state === 'failed'
        ? 'bg-[var(--danger)]/15 border-[var(--danger)]/30 text-[var(--danger)]'
        : 'bg-[var(--ember)] border-[var(--ember)] text-white';

  return (
    <div className="card snap-start shrink-0 w-36 p-3 flex flex-col items-center gap-2 text-center">
      <GradientBorder
        tierId={person.tierId}
        shape="circle"
        fillClassName="rounded-full overflow-hidden"
        glow={false}
        className="shrink-0"
      >
        <JimmyAvatar
          evolutionStage={person.evolutionStage}
          equippedAccessories={person.equippedAccessories}
          showFire={person.showFire}
          crop="head"
          size={56}
          className="bg-neutral-800"
          alt={`${person.displayName} the ${person.tierLabel}`}
        />
      </GradientBorder>

      <div className="min-w-0 w-full">
        <p className="text-sm font-semibold text-neutral-100 truncate">{person.displayName}</p>
        {/* Two lines of context, both deliberately non-numeric about their
            lifting: the tier is a label everyone already wears publicly,
            and the mutual line is about the graph, not the gym. */}
        <p className="text-xs text-neutral-500 truncate">{person.tierLabel}</p>
        <p className="text-[11px] text-neutral-600 truncate mt-0.5" title={(suggestion.mutualNames ?? []).join(', ')}>
          {mutualLabel(suggestion)}
        </p>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        disabled={state === 'sending' || state === 'sent'}
        // aria-live so the state change is announced, not just recoloured —
        // "sent" and "failed" are two greens-and-reds apart visually and
        // identical to a screen reader without it.
        aria-live="polite"
        className={`w-full rounded-xl border px-2 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95 disabled:active:scale-100 ${tone}`}
      >
        {label}
      </button>
    </div>
  );
}

export default function FriendSuggestions({ suggestions, loading, onAdd }) {
  // No empty state and no spinner row. This card sits in the middle of the
  // Social tab, and an account with no friends yet (the case that returns
  // nothing) is exactly the one that should not be shown a permanently
  // empty "People you might know" box explaining its own emptiness.
  if (loading || suggestions.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          People you might know
        </p>
        <p className="text-xs text-neutral-600 mt-0.5">Friends of your friends.</p>
      </div>

      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-4 px-4">
        {suggestions.map((suggestion) => (
          <SuggestionCard key={suggestion.uid} suggestion={suggestion} onAdd={onAdd} />
        ))}
      </div>
    </section>
  );
}
