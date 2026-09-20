import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { sanitizeFriendData } from '../../utils/friendPrivacy';
import { useFriendSearch, MIN_SEARCH_LENGTH } from '../../hooks/useFriendSearch';
import GradientBorder from '../shared/GradientBorder';
import JimmyAvatar from '../evolution/JimmyAvatar';

// Find people by username.
//
// Every row goes through sanitizeFriendData — the same allowlist a
// friend's profile and the suggestion carousel use. These are strangers,
// so this is the screen where a field newly added to public/summary must
// not appear by accident just because the server started returning it.
// Reusing the fence also keeps the volume → tier maths in one place.

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

// Pure Tailwind spinner: a ring with one transparent edge, spun by the
// built-in `animate-spin`. No keyframe of our own needed — this is the one
// piece of motion Tailwind already ships.
function Spinner() {
  return (
    <span
      role="status"
      aria-label="Searching"
      className="block h-4 w-4 animate-spin rounded-full border-2 border-neutral-600 border-t-neutral-200"
    />
  );
}

function ResultRow({ result, onAdd }) {
  const { pathname } = useLocation();
  const person = sanitizeFriendData(result);
  const [state, setState] = useState(
    result.isFriend ? 'friend' : result.requestReceived ? 'received' : result.requestSent ? 'sent' : 'idle',
  );
  // Ref, not state: three fast taps all read the same stale `state` from
  // the closure they were created in, and all three would fire a request.
  const inFlight = useRef(false);

  const handleAdd = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState('sending');
    navigator.vibrate?.([30]);
    try {
      await onAdd(result.uid);
      setState('sent');
    } catch {
      setState('failed');
      inFlight.current = false; // only failure unlatches
    }
  };

  const actionable = state === 'idle' || state === 'failed';
  const label = {
    idle: 'Add',
    sending: '…',
    sent: '✓ Sent',
    failed: 'Retry',
    friend: 'Friends',
    received: 'Wants you',
  }[state];
  const tone =
    state === 'sent' || state === 'friend'
      ? 'bg-[var(--success)]/15 border-[var(--success)]/30 text-[var(--success)]'
      : state === 'failed'
        ? 'bg-[var(--danger)]/15 border-[var(--danger)]/30 text-[var(--danger)]'
        : state === 'received'
          ? 'bg-white/5 border-white/10 text-neutral-400'
          : 'bg-[var(--ember)] border-[var(--ember)] text-white';

  return (
    <li className="flex items-center gap-3 px-1 py-2">
      {/* The name and avatar open their profile — the same public view a
          friend's row links to. Nothing there is gated on friendship, so a
          stranger sees exactly what they published. */}
      <Link to={`/friends/${result.uid}`} state={{ from: pathname }} className="flex min-w-0 flex-1 items-center gap-3">
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
            mascot={person.mascot}
            crop="head"
            size={40}
            className="bg-neutral-800"
            alt={`${person.displayName} the ${person.tierLabel}`}
          />
        </GradientBorder>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-neutral-100">{person.displayName}</span>
          <span className="block truncate text-xs text-neutral-500">{person.tierLabel}</span>
        </span>
      </Link>

      <button
        type="button"
        onClick={handleAdd}
        disabled={!actionable}
        // aria-live so the change is announced and not only recoloured —
        // "sent" and "failed" are two colours apart visually and identical
        // to a screen reader without it.
        aria-live="polite"
        className={`shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95 disabled:active:scale-100 ${tone}`}
      >
        {label}
      </button>
    </li>
  );
}

export default function FriendSearch({ onAddByUid }) {
  const { term, setTerm, results, loading, error } = useFriendSearch();
  const trimmed = term.trim();
  const searching = trimmed.length >= MIN_SEARCH_LENGTH;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
          <SearchIcon />
        </span>
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by username"
          // Phones love to "help" with a name field. All three off: a
          // username is not a word, and an autocapitalised first letter
          // would be invisible to the user but is a real difference to a
          // search box they are watching for results.
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck="false"
          aria-label="Search for people by username"
          className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-9 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-[var(--ember)]/50 focus:outline-none"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner />
          </span>
        )}
      </div>

      {error && <p className="px-1 text-xs text-[var(--danger)]">{error}</p>}

      {/* Only ever one of these renders, and the order matters: the "keep
          typing" hint must not appear while a search is in flight, and
          "no one found" must not appear before the first result lands —
          that flash of a false negative on every search is the most
          common way a working search box feels broken. */}
      {!searching && trimmed.length > 0 && (
        <p className="px-1 text-xs text-neutral-600">Keep typing — at least {MIN_SEARCH_LENGTH} characters.</p>
      )}

      {searching && !loading && results.length === 0 && !error && (
        <p className="px-1 text-xs text-neutral-600">No one found called &ldquo;{trimmed}&rdquo;.</p>
      )}

      {results.length > 0 && (
        <ul className="flex flex-col divide-y divide-white/5">
          {results.map((result) => (
            <ResultRow key={result.uid} result={result} onAdd={onAddByUid} />
          ))}
        </ul>
      )}
    </div>
  );
}
