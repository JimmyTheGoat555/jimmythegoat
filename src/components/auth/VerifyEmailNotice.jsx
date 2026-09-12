import { useState } from 'react';

// Shown wherever an unverified address is about to block someone.
//
// The gate itself is server-side and correct (functions/guards.js: anything
// that puts a notification in a stranger's inbox needs a confirmed
// address). What was missing was any way back. Sign-up fires exactly one
// verification mail, best-effort, with the failure deliberately swallowed
// so a transient send error cannot fail an otherwise good signup — so
// anyone who lost that mail, or whose send quietly failed, hit a 400 at the
// moment they tried to add a friend and had nowhere to go. On this project
// that is 29 of 31 accounts.
//
// "I've confirmed it" is not decoration. Clicking the link flips the flag
// on the Auth record immediately, but the ID token this client holds keeps
// saying otherwise until it rotates, which is up to an hour — and the
// server reads the token. Without a way to force a refresh, someone can
// verify, come straight back, and be told to verify again.
export default function VerifyEmailNotice({ email, onResend, onRecheck, className = '' }) {
  const [state, setState] = useState('idle'); // idle | sending | sent | checking | still-unverified | error

  const resend = async () => {
    setState('sending');
    try {
      await onResend();
      setState('sent');
    } catch {
      setState('error');
    }
  };

  const recheck = async () => {
    setState('checking');
    try {
      // Resolving true unmounts this component (the parent stops rendering
      // it), so there is no success state to set here.
      const ok = await onRecheck();
      setState(ok ? 'idle' : 'still-unverified');
    } catch {
      setState('error');
    }
  };

  return (
    <div className={`rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col gap-2 ${className}`}>
      <p className="text-sm font-semibold text-amber-200">Confirm your email to add friends</p>
      <p className="text-xs text-neutral-400">
        Adding friends and nudging them need a confirmed address
        {email ? <> — we sent a link to <span className="text-neutral-200">{email}</span></> : null}. Check your spam
        folder too.
      </p>

      {state === 'sent' && <p className="text-xs text-[var(--success)]">Sent. Give it a minute, then hit “I've confirmed it”.</p>}
      {state === 'still-unverified' && (
        <p className="text-xs text-amber-200">Still not confirmed. Open the link in the email, then try again.</p>
      )}
      {state === 'error' && <p className="text-xs text-[var(--danger)]">That didn't work — try again in a moment.</p>}

      <div className="flex flex-wrap gap-2 mt-1">
        <button
          type="button"
          onClick={resend}
          disabled={state === 'sending' || state === 'checking'}
          className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-neutral-100 disabled:opacity-50"
        >
          {state === 'sending' ? 'Sending…' : 'Resend link'}
        </button>
        <button
          type="button"
          onClick={recheck}
          disabled={state === 'sending' || state === 'checking'}
          className="rounded-xl bg-[var(--ember)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {state === 'checking' ? 'Checking…' : "I've confirmed it"}
        </button>
      </div>
    </div>
  );
}
