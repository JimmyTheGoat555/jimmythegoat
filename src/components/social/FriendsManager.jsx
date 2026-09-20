import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import FriendSearch from './FriendSearch';

// `friends` is useFriendsGraph(...).friends — [{uid, displayName}],
// resolved from the caller's own users/{uid}.friends array of bare uids
// via the friendCodes lookup table (see useFriendsGraph.js for why that
// indirection exists rather than just storing names in `friends` itself:
// the user's own explicit ask was an array of IDs). `incomingRequests` is
// [{id, fromUid, fromName, status, createdAt}] — someone else's pending
// request to become YOUR friend; approving it is the only thing that ever
// actually adds to `friends` (see social.js's respondToFriendRequest()).
export default function FriendsManager({
  myFriendCode,
  friends,
  incomingRequests,
  onSendRequest,
  onSendRequestByUid,
  onRespond,
  // Rendered inside FriendManagementModal rather than on the page: the
  // accordion header goes away and the content is always open, because a
  // disclosure inside a sheet you deliberately opened is one tap of
  // nothing. The card chrome goes too — the sheet is already the card.
  embedded = false,
}) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(embedded);
  const [codeInput, setCodeInput] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!codeInput.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const { targetName } = await onSendRequest(codeInput);
      setMessage(`Friend request sent to ${targetName}!`);
      setCodeInput('');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRespond = async (fromUid, accept) => {
    setMessage(null);
    try {
      await onRespond(fromUid, accept);
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {!embedded && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-sm font-medium text-neutral-500 self-start"
        >
          {open ? 'Hide friends ▲' : 'Friends & requests ▼'}
          {incomingRequests.length > 0 && !open && (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--ember)] px-1.5 text-xs font-bold text-white">
              {incomingRequests.length}
            </span>
          )}
        </button>
      )}

      {open && (
        <section className={embedded ? 'flex flex-col gap-4' : 'card p-5 flex flex-col gap-4'}>
          <p className="text-sm text-neutral-500">
            Your code: <span className="text-neutral-100 font-semibold tracking-widest">{myFriendCode}</span> — share it
            so friends can add you.{' '}
            <span className="text-[var(--ember)] font-semibold">
              New to Jimmy? They enter it at sign-up and you get +150 coins.
            </span>
          </p>

          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Friend's code"
              className="flex-1 bg-neutral-800 rounded-xl px-3.5 py-3 text-base text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[var(--ember)]"
            />
            <button
              type="submit"
              disabled={busy}
              className="bg-[var(--ember)] text-white font-semibold text-base px-5 rounded-xl disabled:opacity-50"
            >
              Add
            </button>
          </form>

          {message && <p className="text-sm text-neutral-400">{message}</p>}

          {/* Above the pending requests and the friends list, directly
              under the code box: the two are the same job — "get a new
              person into this list" — and a code is now the fallback for
              when you already have one, not the primary route. */}
          <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Find people</p>
            <FriendSearch onAddByUid={onSendRequestByUid} />
          </div>

          {incomingRequests.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Requests</p>
              {incomingRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between text-base bg-[var(--ember)]/10 border border-[var(--ember)]/30 rounded-xl px-3.5 py-2.5"
                >
                  <span className="text-neutral-200">{req.fromName}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleRespond(req.fromUid, true)}
                      className="text-sm font-semibold text-[var(--success)] px-2 py-1"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRespond(req.fromUid, false)}
                      className="text-sm font-semibold text-neutral-500 px-2 py-1"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {friends.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Friends</p>
              <ul className="flex flex-col gap-1.5">
                {friends.map((friend) => (
                  <li
                    key={friend.uid}
                    className="flex items-center justify-between text-base bg-white/10 border border-white/10 rounded-xl px-3.5 py-2.5"
                  >
                    {/* No unfriend control. A ✕ sitting one thumb-width
                        from a name, with no confirmation, deleted a
                        mutual relationship on both sides — the friend was
                        not asked and was not told. Removed at the owner's
                        request; the removeFriend callable still exists
                        server-side (account deletion uses that path), so
                        this is a UI decision, not a lost capability. */}
                    <Link
                      to={`/friends/${friend.uid}`}
                      state={{ from: pathname }}
                      className="text-neutral-300 flex-1 min-w-0 truncate"
                    >
                      {friend.displayName}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
