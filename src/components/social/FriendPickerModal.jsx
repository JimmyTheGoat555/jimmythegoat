import { useState } from 'react';

// "Send this to…" — pick one friend and a routine goes into their inbox.
//
// Same bottom-sheet language as NudgeModal, which this is deliberately
// modelled on: dark scrim, sheet from the bottom on phones, tapping a row
// IS the send (no select-then-confirm two-step for a single choice), and
// the row itself reports back "Sending… → ✓ Sent!" before the sheet
// closes itself.
//
// One thing NudgeModal does not have: a message box. Nudges ship a closed
// catalogue of lines precisely because their text lands on a lock screen.
// This text does not — the push is server-templated from the sender's name
// and the routine title (functions/recommendWorkout.js), and whatever is
// typed here shows only on the card inside the app. That is what makes a
// free-text field safe to offer at all, and it is worth knowing before
// anyone decides to "simplify" by putting this string in the push.
const MAX_MESSAGE = 140;

export default function FriendPickerModal({ routineTitle, friends = [], onSend, onClose }) {
  const [message, setMessage] = useState('');
  const [sendingUid, setSendingUid] = useState(null);
  const [sentUid, setSentUid] = useState(null);
  const [error, setError] = useState(null);

  const handlePick = async (friendUid) => {
    setError(null);
    setSendingUid(friendUid);
    try {
      await onSend(friendUid, message.trim());
      navigator.vibrate?.([20]);
      setSentUid(friendUid);
      setTimeout(onClose, 900);
    } catch (err) {
      // The callable's own HttpsError message is the useful one here —
      // "you just sent them a workout", "you're not friends with that
      // person" — so it is shown as-is rather than flattened to a generic
      // failure.
      setError(err?.message ?? 'Could not send — try again.');
    } finally {
      setSendingUid(null);
    }
  };

  const busy = sendingUid !== null || sentUid !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-neutral-950 sm:max-w-sm sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Recommend this workout to a friend"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-neutral-950 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold text-neutral-50">Send “{routineTitle}”</h2>
            <p className="mt-0.5 text-xs text-neutral-500">Pick a friend. They choose whether to save it.</p>
          </div>
          <button type="button" onClick={onClose} className="px-1 text-2xl leading-none text-neutral-500">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}

          {friends.length === 0 ? (
            <p className="py-2 text-center text-sm text-neutral-500">
              No friends yet. Add someone from the Social tab first.
            </p>
          ) : (
            <>
              <div>
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Try this if you dare! (optional)"
                  aria-label="Message to send with the workout"
                  maxLength={MAX_MESSAGE}
                  disabled={busy}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-base text-neutral-100 placeholder:text-neutral-600 focus:border-[var(--ember)]/50 focus:outline-none disabled:opacity-50"
                />
                {message.length > MAX_MESSAGE - 30 && (
                  <p className="mt-1 text-right text-[11px] text-neutral-600">
                    {MAX_MESSAGE - message.length} left
                  </p>
                )}
              </div>

              <ul className="flex flex-col gap-2">
                {friends.map((friend) => {
                  const thisSending = sendingUid === friend.uid;
                  const thisSent = sentUid === friend.uid;
                  return (
                    <li key={friend.uid}>
                      <button
                        type="button"
                        onClick={() => handlePick(friend.uid)}
                        disabled={busy}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition active:scale-[0.98] disabled:opacity-50 ${
                          thisSent
                            ? 'border-[var(--success)]/30 bg-[var(--success)]/15 text-[var(--success)]'
                            : 'border-white/10 bg-white/5 text-neutral-200'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-neutral-300"
                        >
                          {(friend.displayName ?? '?').charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {friend.displayName ?? 'A friend'}
                        </span>
                        <span className="shrink-0 text-xs font-semibold">
                          {thisSent ? '✓ Sent!' : thisSending ? 'Sending…' : 'Send'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
