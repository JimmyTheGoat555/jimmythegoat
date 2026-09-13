import { useState } from 'react';
import { friendlyAuthError } from '../../utils/authErrors';

// "Please verify your email address."
//
// Worth being clear about what this is and is not for, because nothing in
// this app gates on a confirmed address (the outbound-social check that
// once did was removed — see functions/guards.js). It is for ACCOUNT
// RECOVERY, and specifically for the failure that brought it about:
// Firebase's email enumeration protection means sendPasswordResetEmail
// resolves happily for an address that has no account, so somebody who
// typo'd their email at sign-up gets a cheerful "check your inbox" and no
// mail, forever, with nothing anywhere telling them why. A banner that
// says the address is unconfirmed is the only warning that can arrive
// before they need it.
//
// Dismissible, and only for this app session: it is a nudge, not a wall,
// and re-nagging on every navigation is how people learn to swipe past a
// message without reading it.
export default function UnverifiedEmailBanner({ email, onResend }) {
  const [status, setStatus] = useState(null); // null | 'busy' | 'sent' | { error }
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  const handleResend = async () => {
    setStatus('busy');
    try {
      await onResend();
      setStatus('sent');
    } catch (err) {
      // Almost always auth/too-many-requests, which has a real answer
      // ("wait a few minutes") rather than a generic failure.
      setStatus({ error: friendlyAuthError(err, "Couldn't send it — try again in a minute.") });
    }
  };

  return (
    <div className="relative z-10 mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/15 px-4 py-3 text-sm text-amber-200">
      <span aria-hidden="true">✉️</span>
      <div className="min-w-0 flex-1">
        <p>
          Please verify your email address to secure your account.
          {email && <span className="block truncate text-xs text-amber-200/70">{email}</span>}
        </p>

        {status === 'sent' ? (
          <p className="mt-1 text-xs font-semibold text-[var(--success)]">
            Link sent — check your inbox (and spam).
          </p>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={status === 'busy'}
            className="mt-1 text-xs font-bold underline underline-offset-2 disabled:opacity-60"
          >
            {status === 'busy' ? 'Sending…' : 'Resend Link'}
          </button>
        )}

        {status?.error && <p className="mt-1 text-xs text-[var(--danger)]">{status.error}</p>}
      </div>
      <button
        type="button"
        onClick={() => setHidden(true)}
        aria-label="Dismiss"
        className="px-1 font-bold opacity-70"
      >
        ✕
      </button>
    </div>
  );
}
