import { useState } from 'react';
import LegalDocument from '../legal/LegalDocument';
import {
  PRIVACY_POLICY_SECTIONS,
  TERMS_OF_SERVICE_SECTIONS,
  LAST_UPDATED,
  TERMS_LAST_UPDATED,
} from '../../content/legalContent';

// The blocking consent screen. Shown by App.jsx INSTEAD of the router —
// the same shape as ForcedUsernameModal and the verification gate, for
// the same reason: an overlay leaves the app mounted behind it, a
// replacement leaves nothing to bypass to. It reads as a card; it isn't a
// popup.
//
// Who sees it: anyone signed in whose account has not accepted the
// current LEGAL_VERSION (hooks/useLegalConsent.js) — accounts from before
// sign-up required the box, and everyone again when the documents change.
// Sign out is offered because someone who does not agree must still be
// able to leave; it records nothing, and the gate is waiting at the next
// sign-in.
export default function LegalConsentGate({ onAccept, onSignOut }) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [legalDoc, setLegalDoc] = useState(null);

  const accept = async () => {
    if (!accepted || busy) return;
    setBusy(true);
    try {
      await onAccept();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-neutral-950 px-6 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-900/80 p-6">
        <p className="text-4xl" aria-hidden="true">
          🐐
        </p>
        <h1 className="mt-3 text-2xl font-bold text-neutral-50">Before you keep training</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          Please review and accept the Terms of Service (updated {TERMS_LAST_UPDATED}) and the Privacy Policy. The app
          stays closed until you do.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            id="consent-open-terms"
            onClick={() => setLegalDoc('terms')}
            className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-semibold text-neutral-100 transition active:scale-[0.98]"
          >
            Read the Terms
          </button>
          <button
            type="button"
            id="consent-open-privacy"
            onClick={() => setLegalDoc('privacy')}
            className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-semibold text-neutral-100 transition active:scale-[0.98]"
          >
            Read the Policy
          </button>
        </div>
        <label
          htmlFor="consent-accept"
          className="mt-4 flex items-start gap-3 rounded-2xl border border-white/10 bg-neutral-950/60 px-3 py-3"
        >
          <input
            id="consent-accept"
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--tier-accent,#a78bfa)]"
          />
          <span className="text-[13px] leading-snug text-neutral-200">
            I have read and agree to the Terms of Service and the Privacy Policy.
          </span>
        </label>
        <button
          type="button"
          id="consent-continue"
          disabled={!accepted || busy}
          onClick={accept}
          className="mt-4 w-full rounded-2xl py-3.5 text-base font-extrabold transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
          style={{ background: 'var(--tier-accent, #a78bfa)', color: 'var(--color-jimmy-950)' }}
        >
          {busy ? 'Saving…' : 'Accept and continue'}
        </button>
        <button
          type="button"
          id="consent-sign-out"
          onClick={onSignOut}
          disabled={busy}
          className="mt-3 w-full py-1 text-center text-sm text-neutral-400 disabled:opacity-40"
        >
          Sign out instead
        </button>
      </div>

      {legalDoc === 'privacy' && (
        <LegalDocument
          title="Privacy Policy"
          sections={PRIVACY_POLICY_SECTIONS}
          lastUpdated={LAST_UPDATED}
          onClose={() => setLegalDoc(null)}
        />
      )}
      {legalDoc === 'terms' && (
        <LegalDocument
          title="Terms of Service"
          sections={TERMS_OF_SERVICE_SECTIONS}
          lastUpdated={TERMS_LAST_UPDATED}
          onClose={() => setLegalDoc(null)}
        />
      )}
    </div>
  );
}
