import { useState } from 'react';
import { fullEvolutionGradient } from '../../utils/tierTheme';
import { friendlyAuthError } from '../../utils/authErrors';

const EVOLUTION_GRADIENT = fullEvolutionGradient(90);

// The wall. A signed-in account with an unconfirmed address sees this and
// nothing else — no nav, no tabs, no workout screen (see App.jsx's guard).
//
// Built as an escape hatch first and a gate second, because of who is
// standing in front of it: this is a HARD block on an app whose accounts
// are overwhelmingly unverified, so for most existing users the first
// thing it does is lock them out of their own training history. Every one
// of them needs a way through inside ten seconds. Hence: the address
// spelled out (a typo at sign-up is the single most common reason no mail
// ever arrives, and seeing it is the only way to know), a resend that
// says what happened either way, a spam reminder, and a sign-out that is
// a real way out rather than a footnote.
//
// "I Verified! Let Me In" exists because clicking the link in a mail app
// does not tell this tab anything: emailVerified rides on a token minted
// at sign-in, so the app cannot notice until something calls reload().
// The button is that call, made explicit — and useAuth also reloads
// whenever the tab regains focus, so coming back from the mail app
// usually gets you in before you press it.
export default function PendingVerificationScreen({
  email,
  notice,
  onRecheck,
  onResend,
  onChangeEmail,
  onSignOut,
}) {
  const [checking, setChecking] = useState(false);
  const [stillUnverified, setStillUnverified] = useState(false);
  const [resend, setResend] = useState(null); // null | 'busy' | 'sent' | { error }
  // Fixing a wrong address. Closed by default — it is the answer to a
  // question most people will not have.
  const [changing, setChanging] = useState(false);
  const [nextEmail, setNextEmail] = useState('');
  const [change, setChange] = useState(null); // null | 'busy' | { sentTo } | { error }

  const handleRecheck = async () => {
    setChecking(true);
    setStillUnverified(false);
    try {
      const verified = await onRecheck();
      // A `true` unmounts this screen from above — App swaps the whole
      // tree — so there is nothing to do for the success case here.
      if (!verified) setStillUnverified(true);
    } catch {
      setStillUnverified(true);
    } finally {
      setChecking(false);
    }
  };

  const handleChangeEmail = async (e) => {
    e.preventDefault();
    const target = nextEmail.trim();
    if (!target) return;
    setChange('busy');
    try {
      await onChangeEmail(target);
      // Says where the link went, never that the change is done — Firebase
      // swaps the address only when the link is opened.
      //
      // And note what this resolving does NOT prove. This project has
      // email enumeration protection on (verified against the Identity
      // Toolkit API: a password reset for an address with no account comes
      // back 200, not EMAIL_NOT_FOUND). That protection means Firebase
      // will not tell a client whether an address is already registered —
      // so a change aimed at an address that ALREADY HAS AN ACCOUNT
      // resolves exactly like this one and sends nothing at all. The
      // caller cannot distinguish the two, which is why the note below
      // names the case instead of promising delivery.
      setChange({ sentTo: target });
    } catch (err) {
      setChange({
        error: friendlyAuthError(
          err,
          "Couldn't change the email — try again.",
        ),
      });
    }
  };

  const handleResend = async () => {
    setResend('busy');
    try {
      await onResend();
      setResend('sent');
    } catch (err) {
      // Nearly always auth/too-many-requests, which has a real answer
      // rather than a shrug.
      setResend({ error: friendlyAuthError(err, "Couldn't send it — try again in a minute.") });
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        {/* The same gradient hairline the sign-in fields wear, so this
            reads as part of the front door rather than an error page. */}
        <div className="rounded-3xl p-[2px]" style={{ background: EVOLUTION_GRADIENT }}>
          <div className="flex flex-col items-center rounded-[22px] bg-neutral-950 px-6 py-8 text-center">
            <span aria-hidden="true" className="text-5xl leading-none">
              ✉️
            </span>

            <h1 className="mt-4 text-2xl font-bold text-neutral-50">Verify Your Email</h1>

            <p className="mt-2 text-sm leading-snug text-neutral-400">
              We sent a link to{' '}
              <span className="font-semibold text-neutral-100">{email ?? 'your email address'}</span>. Click
              it to unlock your account.
            </p>

            {/* The spam reminder, promoted out of body text.

                It was already here as a `text-neutral-600` line — the
                dimmest type on the screen, sitting directly under the one
                sentence people actually read, which is a good way to be
                present and still not be seen. Since a mail in the junk
                folder is currently the most common reason someone stalls
                here, it gets a box of its own.

                Deliberately NOT the amber treatment the `notice` slot
                below uses. That styling means "something went wrong" —
                a trainer code that did not resolve, a verification mail
                that failed to send — and spending it on routine advice
                would leave a real failure looking exactly like a tip. So:
                same shape, same radius, neutral fill, with the icon
                carrying the emphasis instead of the colour. */}
            <div className="mt-3 flex w-full items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-left">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="mt-px h-4 w-4 shrink-0 text-neutral-400"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              <p className="text-xs leading-snug text-neutral-300">
                <span className="font-semibold text-neutral-100">Note:</span> If you don&rsquo;t see the
                email within a minute, please check your spam or junk folder.
              </p>
            </div>

            {/* Kept, and kept quiet. A mistyped address is the other
                reason no mail arrives, and unlike spam it cannot be fixed
                by looking harder — hence the separate line pointing back
                at the address above, and the change-email button further
                down that actually resolves it. */}
            <p className="mt-2 text-xs text-neutral-600">
              Still nothing? Check the address above is spelled right.
            </p>

            {notice && (
              <p className="mt-3 w-full rounded-xl border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-xs text-amber-200">
                {notice}
              </p>
            )}

            <button
              type="button"
              onClick={handleRecheck}
              disabled={checking}
              className="btn-arcade mt-6 w-full py-4 text-lg disabled:opacity-60"
            >
              {checking ? 'Checking…' : 'I Verified! Let Me In'}
            </button>

            {stillUnverified && (
              <p className="mt-2 text-xs text-[var(--danger)]">
                Still not verified. Open the link in the email first, then try again.
              </p>
            )}

            {resend === 'sent' ? (
              <p className="mt-3 text-sm font-semibold text-[var(--success)]">
                New link sent — check your inbox.
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resend === 'busy'}
                className="mt-3 w-full rounded-2xl border border-white/15 py-3.5 text-base font-semibold text-neutral-200 transition active:scale-[0.97] disabled:opacity-60"
              >
                {resend === 'busy' ? 'Sending…' : 'Resend Link'}
              </button>
            )}

            {resend?.error && <p className="mt-2 text-xs text-[var(--danger)]">{resend.error}</p>}

            {/* Keeps the account, fixes the address. The whole reason this
                is here: an account that cannot receive mail is not a
                throwaway to its owner — their workouts, coins, badges and
                friends are all on it, and "verify or lose it" is a false
                choice when the only thing wrong is a typo. */}
            {change?.sentTo ? (
              <div className="mt-5 w-full text-left">
                <p className="text-sm font-semibold text-[var(--success)]">
                  Link sent to {change.sentTo}. Open it to finish — your account, history and coins stay
                  exactly as they are.
                </p>
                {/* The honest part. Firebase will not say whether an
                    address is taken, so "sent" cannot mean "delivered" and
                    pretending otherwise leaves people refreshing an inbox
                    for a mail that was never going to arrive. */}
                <p className="mt-2 text-xs leading-snug text-neutral-400">
                  Nothing after a minute? Check spam. And an address that{' '}
                  <span className="font-semibold text-neutral-200">already has its own Jimmy account</span>{' '}
                  can&rsquo;t be used here — Gmail lets you add a suffix, so{' '}
                  <span className="font-semibold text-neutral-200">you+gym@gmail.com</span> reaches the same
                  inbox as a different address.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setChange(null);
                    setNextEmail('');
                  }}
                  className="mt-2 text-xs font-semibold text-[var(--ember)] underline underline-offset-2"
                >
                  Try a different address
                </button>
              </div>
            ) : changing ? (
              <form onSubmit={handleChangeEmail} className="mt-5 w-full">
                <label htmlFor="new-email" className="block text-left text-xs font-semibold text-neutral-400">
                  New email address
                </label>
                <input
                  id="new-email"
                  type="email"
                  value={nextEmail}
                  onChange={(ev) => setNextEmail(ev.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-base text-neutral-100 placeholder:text-neutral-600 focus:border-[var(--ember)]/50 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={change === 'busy' || !nextEmail.trim()}
                  className="mt-2 w-full rounded-2xl bg-[var(--ember)] py-3 text-sm font-bold text-white transition active:scale-[0.97] disabled:opacity-50"
                >
                  {change === 'busy' ? 'Sending…' : 'Send link to this address'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChanging(false);
                    setChange(null);
                  }}
                  className="mt-1.5 w-full py-2 text-xs font-medium text-neutral-500"
                >
                  Cancel
                </button>
                {change?.error && <p className="mt-1 text-xs text-[var(--danger)]">{change.error}</p>}
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setChanging(true)}
                className="mt-5 text-sm font-semibold text-[var(--ember)] underline underline-offset-2"
              >
                Wrong email? Change it and keep your account
              </button>
            )}

            <button
              type="button"
              onClick={onSignOut}
              className="mt-3 text-sm font-medium text-neutral-500 underline underline-offset-2"
            >
              Sign out / use a different account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
