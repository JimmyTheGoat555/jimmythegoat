import { useEffect, useState } from "react";
import { fullEvolutionGradient } from "../../utils/tierTheme";
import { friendlyAuthError } from "../../utils/authErrors";

const EVOLUTION_GRADIENT = fullEvolutionGradient(90);

// Long enough that nobody taps themselves into 'auth/too-many-requests'
// — which is the one failure here with no self-service fix, since the
// only answer to being rate-limited is to go away and come back. Short
// enough to be a pause rather than a second wall.
const RESEND_COOLDOWN_S = 30;

// The wall. A signed-in account with an unconfirmed address sees this and
// nothing else — no nav, no tabs, no workout screen (see App.jsx's guard).
//
// Built as an escape hatch first and a gate second, because of who is
// standing in front of it: this is a HARD block on an app whose accounts
// are overwhelmingly unverified, so for most existing users the first
// thing it does is lock them out of their own training history. Every one
// of them needs a way through inside ten seconds. Hence: the address
// spelled out (a typo at sign-up is now the single most common reason no
// mail arrives, and seeing it is the only way to know), a resend that
// says what happened either way AND stays on screen after it works, one
// line on why the gate exists at all, and a sign-out that is a real way
// out rather than a footnote.
//
// There used to be a prominent spam/junk/Promotions reminder here. It
// came out when auth mail moved to a verified custom domain and stopped
// being filtered — advice that is no longer true costs trust and pushes
// the things that ARE true further down the card. If delivery ever
// regresses, that box is the thing to bring back.
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
  const [cooldown, setCooldown] = useState(0); // seconds left before another send
  // Fixing a wrong address. Closed by default — it is the answer to a
  // question most people will not have.
  const [changing, setChanging] = useState(false);
  const [nextEmail, setNextEmail] = useState("");
  const [change, setChange] = useState(null); // null | 'busy' | { sentTo } | { error }

  // Self-rescheduling rather than one interval, so a backgrounded tab
  // that throttles timers just resumes counting instead of drifting or
  // firing a burst of catch-up ticks on return.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

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
    setChange("busy");
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
        error: friendlyAuthError(err, "Couldn't change the email — try again."),
      });
    }
  };

  const handleResend = async () => {
    setResend("busy");
    try {
      await onResend();
      setResend("sent");
      setCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      // Nearly always auth/too-many-requests, which has a real answer
      // rather than a shrug.
      setResend({
        error: friendlyAuthError(
          err,
          "Couldn't send it — try again in a minute.",
        ),
      });
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        {/* The same gradient hairline the sign-in fields wear, so this
            reads as part of the front door rather than an error page. */}
        <div
          className="rounded-3xl p-[2px]"
          style={{ background: EVOLUTION_GRADIENT }}
        >
          <div className="flex flex-col items-center rounded-[22px] bg-neutral-950 px-6 py-8 text-center">
            <span aria-hidden="true" className="text-5xl leading-none">
              ✉️
            </span>

            <h1 className="mt-4 text-2xl font-bold text-neutral-50">
              Verify Your Email
            </h1>

            <p className="mt-2 text-sm leading-snug text-neutral-400">
              We sent a link to{" "}
              <span className="font-semibold text-neutral-100">
                {email ?? "your email address"}
              </span>
              . Click it to unlock your account.
            </p>

            {/* The "why", which this screen never said.

                A hard gate with no stated reason reads as the app being
                awkward for its own sake, and the reason here is genuinely
                in the reader's interest rather than ours: an unverified
                address cannot receive a password reset, so an account
                behind one is a single forgotten password away from being
                gone for good. Worth one sentence, in their terms — what
                it protects, not what it lets us do. */}
            <p className="mt-2 text-xs leading-relaxed text-neutral-500">
              One-time step. Verifying secures your account and is what lets you{" "}
              <span className="font-semibold text-neutral-300">
                reset your password
              </span>{" "}
              if you ever lose it.
            </p>

            {/* With filtering out of the picture, a mistyped address is
                what is left when no mail arrives — and it is the one
                cause the reader cannot fix by waiting or looking
                somewhere else. Hence the line pointing back at the
                address spelled out above, and the change-email button
                further down that actually resolves it. */}
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
              {checking ? "Checking…" : "I Verified! Let Me In"}
            </button>

            {stillUnverified && (
              <p className="mt-2 text-xs text-[var(--danger)]">
                Still not verified. Open the link in the email first, then try
                again.
              </p>
            )}

            {/* The confirmation sits ABOVE the button instead of
                replacing it.

                It used to replace it, and that was the deadlock this
                screen exists to prevent: one successful send swapped the
                button for a line of green text permanently, so anyone
                whose second mail also failed to arrive — a slow relay, a
                strict filter, a full mailbox — had no way to ask for a
                third short of reloading the app. A send that works is
                not proof a mail landed, so the control that asks for one
                has no business disappearing on a maybe.

                The cooldown is what makes keeping it safe: the only way
                to genuinely strand someone here is to let them tap into
                Firebase's rate limit, so the button counts instead of
                going quiet — visibly still there, plainly coming back. */}
            {resend === "sent" && (
              <p className="mt-3 text-sm font-semibold text-[var(--success)]">
                New link sent — check your inbox.
              </p>
            )}

            <button
              type="button"
              onClick={handleResend}
              disabled={resend === "busy" || cooldown > 0}
              className="mt-3 w-full rounded-2xl border border-white/15 py-3.5 text-base font-semibold text-neutral-200 transition active:scale-[0.97] disabled:opacity-60"
            >
              {resend === "busy"
                ? "Sending…"
                : cooldown > 0
                  ? `Resend again in ${cooldown}s`
                  : resend === "sent"
                    ? "Send Another Link"
                    : "Resend Verification Email"}
            </button>

            {resend?.error && (
              <p className="mt-2 text-xs text-[var(--danger)]">
                {resend.error}
              </p>
            )}

            {/* Keeps the account, fixes the address. The whole reason this
                is here: an account that cannot receive mail is not a
                throwaway to its owner — their workouts, coins, badges and
                friends are all on it, and "verify or lose it" is a false
                choice when the only thing wrong is a typo. */}
            {change?.sentTo ? (
              <div className="mt-5 w-full text-left">
                <p className="text-sm font-semibold text-[var(--success)]">
                  Link sent to {change.sentTo}. Open it to finish — your
                  account, history and coins stay exactly as they are.
                </p>
                {/* The honest part. Firebase will not say whether an
                    address is taken, so "sent" cannot mean "delivered" and
                    pretending otherwise leaves people refreshing an inbox
                    for a mail that was never going to arrive. */}
                <p className="mt-2 text-xs leading-snug text-neutral-400">
                  Nothing after a minute? An address that{" "}
                  <span className="font-semibold text-neutral-200">
                    already has its own Jimmy account
                  </span>{" "}
                  can&rsquo;t be used here — Gmail lets you add a suffix, so{" "}
                  <span className="font-semibold text-neutral-200">
                    you+gym@gmail.com
                  </span>{" "}
                  reaches the same inbox as a different address.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setChange(null);
                    setNextEmail("");
                  }}
                  className="mt-2 text-xs font-semibold text-[var(--ember)] underline underline-offset-2"
                >
                  Try a different address
                </button>
              </div>
            ) : changing ? (
              <form onSubmit={handleChangeEmail} className="mt-5 w-full">
                <label
                  htmlFor="new-email"
                  className="block text-left text-xs font-semibold text-neutral-400"
                >
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
                  disabled={change === "busy" || !nextEmail.trim()}
                  className="mt-2 w-full rounded-2xl bg-[var(--ember)] py-3 text-sm font-bold text-white transition active:scale-[0.97] disabled:opacity-50"
                >
                  {change === "busy" ? "Sending…" : "Send link to this address"}
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
                {change?.error && (
                  <p className="mt-1 text-xs text-[var(--danger)]">
                    {change.error}
                  </p>
                )}
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
