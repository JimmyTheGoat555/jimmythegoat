import { useCallback, useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { LEGAL_VERSION } from '../content/legalContent';

// Whether the signed-in account has accepted the CURRENT Terms and
// Privacy Policy, and the action that records it. App.jsx renders the
// consent gate (components/auth/LegalConsentGate.jsx) instead of the app
// while `needsConsent` is true — so nobody uses the app without agreeing,
// whether they signed up before the gate existed or the documents moved
// on since they last agreed (LEGAL_VERSION).
//
// The record of acceptance lives on users/{uid} (legalAcceptedVersion,
// legalAcceptedAt). This device remembers it too, for one reason: the
// write is an owner update of two allow-listed fields, and if the rule
// allowing them is not deployed yet, or the device is offline, a person
// who has just tapped Accept must not be stranded on the gate. Their
// tap is what matters; the document is our bookkeeping, retried on every
// load until it lands.
export function useLegalConsent(user, account, acceptLegal) {
  const uid = user?.uid ?? null;
  const [local, setLocal] = useLocalStorage(`legal-accepted:${uid ?? 'anon'}`, null);
  const stored = account?.legalAcceptedVersion === LEGAL_VERSION;
  const remembered = local === LEGAL_VERSION;
  const loaded = Boolean(uid && account);
  const needsConsent = loaded && !stored && !remembered;

  useEffect(() => {
    if (!loaded || stored || !remembered) return;
    acceptLegal(LEGAL_VERSION).catch(() => {});
  }, [loaded, stored, remembered, acceptLegal]);

  const accept = useCallback(async () => {
    setLocal(LEGAL_VERSION);
    try {
      await acceptLegal(LEGAL_VERSION);
    } catch {
      // Remembered here; the effect above lands it on the next load.
    }
  }, [setLocal, acceptLegal]);

  return { needsConsent, accept };
}
