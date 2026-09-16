import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { REST_BOOSTS_PER_DAY, REST_BOOST_TTL_MS } from '../data/storeItems';

// The rest-timer offer is only made while the rest has this much left. A
// UI rule, not a server one: the server cannot see a rest timer, and what
// bounds the boost server-side is the daily cap and the token's TTL
// (functions/restBoost.js). This number is about urgency — the offer is
// something to take while there is still time to sit through the ad, not
// a button that follows the countdown down to zero.
//
// `secondsLeft` is a ceiling (useRestTimer), so ">= 60" reads as: shown
// for the whole of "1:00", gone the moment the clock shows "0:59".
export const REST_BOOST_OFFER_MIN_SECONDS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

function fresh(grantedAt, now) {
  const ms = Date.parse(grantedAt);
  return Number.isFinite(ms) && now - ms < REST_BOOST_TTL_MS;
}

function withinDay(iso, now) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && now - ms < DAY_MS;
}

// One shared empty list, so an account with nothing loaded yields the SAME
// array every render and the memos below do not recompute for nothing.
const EMPTY_LIST = [];
const EMPTY_SNAPSHOT = { uid: null, tokens: EMPTY_LIST, claimsAt: EMPTY_LIST };

// The account's rest-timer boost tokens, read off users/{uid}/meta/economy
// — the SAME document logWorkout redeems them from, which is the point:
// the client can only read it (firestore.rules), so a boost the timer shows
// as armed is one the server will actually honour, and one it shows as
// spent is spent. Same arrangement as useWorkoutCooldown, on the same doc.
//
// Two lists come off the document:
//
//   * `restBoosts`        — pending tokens, { id, grantedAt }. Filtered
//                           here by the TTL the server applies, so an
//                           expired one stops reading as armed at roughly
//                           the moment it stops being redeemable.
//   * `restBoostClaimsAt` — when today's tokens were claimed. The daily
//                           cap lives in rateLimits/{uid}, which no client
//                           can read; this mirror is how the offer hides
//                           itself once the budget is spent rather than
//                           playing an ad the server will then refuse.
//
// `addLocalToken` folds in the callable's own response so the timer reads
// "armed" the instant the ad ends rather than a snapshot later. The
// snapshot remains the authority: a local entry is dropped as soon as the
// server's list includes it, and never outlives the TTL either way. When
// real ads are live the grant arrives out of band (AdMob → the server) and
// there is no response to fold in — the snapshot alone carries it, which
// is why this hook, not the callable, is what the workout screen trusts.
export function useRestBoost(uid, { bypass = false } = {}) {
  // The last snapshot, stamped with the uid it was for. "Loading" is
  // DERIVED from that stamp rather than flipped in the effect — an
  // account switch is answered by the first snapshot for the new uid, and
  // until then the old account's tokens are simply not read.
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [localTokens, setLocalTokens] = useState([]);
  const [localClaimsAt, setLocalClaimsAt] = useState([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(
      doc(db, 'users', uid, 'meta', 'economy'),
      (snap) => {
        const data = snap.data() ?? {};
        const tokens = Array.isArray(data.restBoosts) ? data.restBoosts : [];
        const claimsAt = Array.isArray(data.restBoostClaimsAt) ? data.restBoostClaimsAt : [];
        setSnapshot({ uid, tokens, claimsAt });
        // The server has caught up with anything claimed locally — and if
        // it has since SPENT a token, the local copy must not resurrect
        // it. Claims dedupe on the exact ISO string the server stored.
        const serverIds = new Set(tokens.map((t) => t?.id));
        setLocalTokens((prev) => prev.filter((t) => !serverIds.has(t.id)));
        const serverClaims = new Set(claimsAt);
        setLocalClaimsAt((prev) => prev.filter((iso) => !serverClaims.has(iso)));
        setNow(Date.now());
      },
      // A read failure must never break a workout. With no list the offer
      // simply behaves as if nothing were armed and the budget were full;
      // the server still enforces every real rule at claim and at log.
      () => setSnapshot({ uid, tokens: [], claimsAt: [] }),
    );
  }, [uid]);

  const loaded = Boolean(uid) && snapshot.uid === uid;
  const serverTokens = loaded ? snapshot.tokens : EMPTY_LIST;
  const serverClaimsAt = loaded ? snapshot.claimsAt : EMPTY_LIST;

  const pendingTokens = useMemo(() => {
    const byId = new Map();
    for (const token of [...serverTokens, ...localTokens]) {
      if (!token || typeof token.id !== 'string' || !fresh(token.grantedAt, now) || byId.has(token.id)) continue;
      byId.set(token.id, { id: token.id, grantedAt: token.grantedAt });
    }
    // Oldest first, so the token bound to the next exercise is the one
    // closest to expiring.
    return [...byId.values()].sort((a, b) => Date.parse(a.grantedAt) - Date.parse(b.grantedAt));
  }, [serverTokens, localTokens, now]);

  // Re-sample the clock occasionally while anything is pending, so a
  // token that crosses its TTL mid-session stops reading as armed without
  // waiting for an unrelated snapshot. A minute is plenty: the TTL is
  // hours, and nothing here needs to be exact to the second.
  const hasPending = pendingTokens.length > 0;
  useEffect(() => {
    if (!hasPending) return undefined;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [hasPending]);

  const claimsInWindow = useMemo(
    () => [...serverClaimsAt, ...localClaimsAt].filter((iso) => withinDay(iso, now)).length,
    [serverClaimsAt, localClaimsAt, now],
  );
  // ADMIN BYPASS — mirrors the server's own exemption in functions/guards.js
  // so the owner can test the flow back to back. Visibility only; the
  // server's limiter is the boundary, and it has the same exemption.
  const remainingToday = bypass ? Infinity : Math.max(0, REST_BOOSTS_PER_DAY - claimsInWindow);

  const addLocalToken = useCallback((data) => {
    if (!data || typeof data.tokenId !== 'string') return;
    const grantedAt = typeof data.grantedAt === 'string' ? data.grantedAt : new Date().toISOString();
    setLocalTokens((prev) => [...prev, { id: data.tokenId, grantedAt }]);
    // The budget shrinks now, not a snapshot later, so a second tap in
    // the same rest cannot offer a fourth boost the server would refuse.
    setLocalClaimsAt((prev) => [...prev, grantedAt]);
    setNow(Date.now());
  }, []);

  return { pendingTokens, remainingToday, loading: Boolean(uid) && !loaded, addLocalToken };
}
