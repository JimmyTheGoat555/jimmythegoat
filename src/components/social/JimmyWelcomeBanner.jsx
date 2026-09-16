import { useLocalStorage } from '../../hooks/useLocalStorage';

// A new account arrives on the Social tab already friends with Jimmy —
// that happens server-side the moment the address is verified (see
// functions/welcomeFriend.js). Nothing on screen ever said so. The feed
// just had a stranger's workouts in it, or, if Jimmy had not trained
// lately, the same "No workouts from friends yet" a friendless account
// sees. Either way the one connection every user starts with was
// invisible, which is the gap this closes.
//
// SHOWN ONCE, AND ONLY WHEN TRUE. Two conditions, both required:
//
//   * the official uid really is in this user's friends array — the uid
//     comes from the callable itself, not from matching a display name,
//     because 'Jimmy' is a name any user can set on themselves;
//   * this account has not dismissed it before.
//
// Dismissal is per-account localStorage rather than a Firestore field:
// it is a UI preference on one device, worth no read, no write, and no
// rule. It uses useLocalStorage, so dismissing it in one tab closes it
// in the others too.
export default function JimmyWelcomeBanner({ myUid, friendUids, officialFriendUid }) {
  const [dismissed, setDismissed] = useLocalStorage(`jimmy-welcome-seen:${myUid ?? 'anon'}`, false);

  // Deliberately not "does this user have any friends". The banner names
  // Jimmy, so it has to be about Jimmy — a user who has friends but not
  // the official account (an old account from before the rule, one the
  // backfill missed) would otherwise be told about a connection they do
  // not have.
  const connected = Boolean(officialFriendUid) && friendUids.includes(officialFriendUid);
  if (dismissed || !connected) return null;

  return (
    <aside
      // aria-label rather than a heading: this is an aside about the page,
      // not a section of it, and it must not interrupt the heading order
      // between "Social" and the feed.
      aria-label="Welcome"
      className="flex items-start gap-3 rounded-2xl border border-[var(--tier-accent)]/30 bg-[var(--tier-accent)]/10 px-4 py-3"
    >
      <span className="text-xl leading-none" aria-hidden="true">
        🐐
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-neutral-100">You&rsquo;re friends with Jimmy</p>
        <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">
          His workouts show up in your feed below, and yours show up in his. Add more friends with
          the 👤+ button up top.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss welcome message"
        className="-mr-1 -mt-1 shrink-0 rounded-full px-2 py-1 text-lg leading-none text-neutral-500 transition active:scale-90"
      >
        ✕
      </button>
    </aside>
  );
}
