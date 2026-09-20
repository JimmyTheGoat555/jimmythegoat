import { useState } from 'react';

// The blocking rename. Shown when users/{uid}.mustChangeUsername is true,
// and there is no way past it but a new, unique name.
//
// ── WHY A SCREEN AND NOT A MODAL OVER THE APP ────────────────────────────
//
// The brief said "non-dismissible popup". A popup is the weaker of the two
// and only looks equivalent: an overlay still has the app mounted behind
// it, still tabbable, still reachable by anything that moves focus, and
// still one devtools `display:none` from being gone. App.jsx returns this
// INSTEAD of the router — the same shape PendingVerificationScreen already
// uses for the same reason — so there is nothing behind it to bypass to.
// It is styled as a card so it reads like a popup; it just isn't one.
//
// ── AND WHY THE CLIENT SIDE IS NOT THE ENFORCEMENT ───────────────────────
//
// None of the above is security. The flag lives on a document field that
// is NOT in firestore.rules' client update allowlist, so a user cannot
// clear it; and claimUsername refuses to accept the name they already have
// while the flag is set, so the modal cannot be satisfied by submitting
// its own default. Someone who deletes this component from their bundle
// gets an app whose rename requirement is still true on the server.
//
// Sign out is offered because a user who does not want to rename must
// still be able to leave. It resolves nothing — the flag is waiting on the
// next sign-in.
export default function ForcedUsernameModal({ currentName, onSubmit, onSignOut }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const trimmed = name.trim();
  // The one check worth doing here is the one the server also makes, so
  // the button is not live for an input that is guaranteed to be refused.
  const unchanged = trimmed.toLowerCase() === (currentName ?? '').trim().toLowerCase();

  const submit = async (event) => {
    event.preventDefault();
    if (!trimmed || unchanged || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      // No success branch on purpose: the profile snapshot clears
      // mustChangeUsername, App stops rendering this, and the app appears.
    } catch (err) {
      // claimUsername's HttpsError messages are written for this box —
      // "“Reef” is taken — try another." and friends.
      setError(err?.message ?? "Couldn't save that name — try again.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-neutral-950 px-6 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-900/80 p-6">
        <p className="text-4xl" aria-hidden="true">
          🐐
        </p>
        <h1 className="mt-3 text-2xl font-bold text-neutral-50">Pick a new name</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          Names are unique now, and yours needs to change before you can keep training.
          {currentName ? (
            <>
              {' '}
              You&rsquo;re currently <span className="text-neutral-200">{currentName}</span>.
            </>
          ) : null}
        </p>

        <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
          <label htmlFor="forced-username" className="sr-only">
            New name
          </label>
          <input
            id="forced-username"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            autoFocus
            maxLength={20}
            autoComplete="off"
            placeholder="Your new name"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'forced-username-error' : undefined}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-base text-neutral-100 placeholder:text-neutral-600 focus:border-[var(--ember)]/50 focus:outline-none"
          />

          {unchanged && trimmed ? (
            <p className="text-xs text-neutral-500">That&rsquo;s the name you already have.</p>
          ) : null}
          {error ? (
            <p id="forced-username-error" className="text-xs text-[var(--danger)]">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!trimmed || unchanged || busy}
            className="btn-arcade w-full py-3.5 text-base disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save Name'}
          </button>
        </form>

        {/* No close, no skip, no "later". The only other door is out. */}
        <button
          type="button"
          onClick={onSignOut}
          className="mt-4 w-full text-xs text-neutral-500 underline underline-offset-2"
        >
          Sign out instead
        </button>
      </div>
    </div>
  );
}
