import { useEffect, useState } from 'react';

// A nudge to confirm the email address on the account, not a gate.
//
// Deliberately non-blocking: nothing in this app is gated on a verified
// address, and locking someone out of their own workout log over an
// unreceived email would cost far more than it protects. What verification
// buys us is a real address to send a password reset to, and a way to tell a
// typo'd signup apart from a live account — both of which stay useful even
// if the person never clicks.
//
// Dismissal is per-session (component state, not storage): it gets out of
// the way now without permanently hiding the one prompt that lets someone
// recover their account later.
export default function VerifyEmailBanner({ email, onResend, onRecheck }) {
  const [dismissed, setDismissed] = useState(false);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  // The link opens a Firebase-hosted page in another tab, so coming back to
  // this one is the moment to re-check — otherwise the banner sits there
  // telling someone to do a thing they just did.
  useEffect(() => {
    const onFocus = () => { onRecheck?.(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [onRecheck]);

  if (dismissed) return null;

  const handleResend = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await onResend();
      setStatus('Sent — check your inbox (and spam).');
    } catch {
      setStatus('Couldn\'t send just now. Try again in a minute.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative z-10 mt-4 px-4 py-3 rounded-2xl border text-sm flex items-start gap-2 bg-amber-500/15 border-amber-500/30 text-amber-200">
      <span>📧</span>
      <div className="flex-1 min-w-0">
        <p>
          Confirm your email{email ? ` (${email})` : ''} so you can recover your account if you forget
          your password.
        </p>
        {status ? (
          <p className="text-xs mt-1 opacity-80">{status}</p>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={busy}
            className="text-xs mt-1 underline underline-offset-2 disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Resend the email'}
          </button>
        )}
      </div>
      <button type="button" onClick={() => setDismissed(true)} className="font-bold px-1 opacity-70">
        ✕
      </button>
    </div>
  );
}
