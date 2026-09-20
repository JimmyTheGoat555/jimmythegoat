import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, CARD, INPUT, LABEL, Panel, fmt } from './consoleUi';
import JimmyAvatar from '../evolution/JimmyAvatar';
import { EVOLUTION_TIERS, getEvolutionProgress, progressionScale } from '../../utils/evolutionTiers';

// Targeted User Actions — the Operations tab's "God Mode" for one account
// at a time: find them, read their dossier, then message them, move their
// coins, shift their tier or swap their character. Every action is one of
// the admin-only callables in functions/adminUserActions.js (through
// hooks/useAdminOps.js), which re-check the caller against Auth on every
// call; this panel adds the thing a server cannot — the dossier and a
// preview of what each button will do, before it is pressed. After any
// action the dossier is re-read from the server, so what is shown is what
// is stored, never what the panel assumed.

const SEARCH_DEBOUNCE_MS = 300;
const MIN_TERM = 2;
const MAX_RESULTS = 8;
const MESSAGE_TITLE_MAX = 80;
const MESSAGE_BODY_MAX = 500;
const NOTE_MAX = 120;
const MASCOT_NAMES = { jimmy: 'Jimmy', gena: 'Gena' };
const MAX_STAGE = EVOLUTION_TIERS[EVOLUTION_TIERS.length - 1].stage;

function Notice({ tone = 'ok', children }) {
  return (
    <p
      className={`rounded-xl px-3 py-2 text-xs leading-snug ${
        tone === 'ok'
          ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-neutral-100'
          : 'bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] text-neutral-100'
      }`}
      role="status"
    >
      {children}
    </p>
  );
}

function Chip({ children, tone = 'neutral', title }) {
  const styles =
    tone === 'accent'
      ? 'border-[color-mix(in_srgb,var(--tier-accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--tier-accent)_14%,transparent)] text-neutral-50'
      : tone === 'warn'
        ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
        : tone === 'bad'
          ? 'border-[color-mix(in_srgb,var(--danger)_50%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-neutral-100'
          : 'border-white/10 bg-white/[0.04] text-neutral-300';
  return (
    <span title={title} className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${styles}`}>
      {children}
    </span>
  );
}

function dateLabel(iso) {
  const ms = Date.parse(iso ?? '');
  if (!Number.isFinite(ms)) return 'never';
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} d ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// The tier a volume earns on a ladder, un-penalised (no lastWorkoutAt):
// the server's tierForVolume, which is what every action below moves.
function tierAt(volume, minStage, scale) {
  return getEvolutionProgress(volume, { minStage, scale }).current;
}

// ── Picking the account ──────────────────────────────────────────────────
//
// Live and case-insensitive, and it does not wait on the server. The
// console has already loaded a directory of accounts (adminAnalytics's
// rows — uid, display name, email, character; AdminDashboard.jsx asks for
// the server's full cap), so every keystroke filters that list here, at
// once. The server search (adminFindUsers) runs debounced alongside and
// its extra matches are merged in — it covers accounts past the row cap
// and the usernames/{key} lookup — but a server that is slow, or not yet
// deployed, only ever costs those extras, never the list.
//
// There is no `username` field on users/{uid}: the name people search by
// IS `displayName`, and the reservation under usernames/{key} holds the
// same string folded (functions/usernames.js). The filter folds the same
// way, so "vak_ninos", "Vak Ninos" and "vakninos" are one name.
const fold = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[\s_.-]+/g, '');

function matchesTerm(row, term, folded) {
  const name = String(row.displayName ?? '').toLowerCase();
  const email = String(row.email ?? '').toLowerCase();
  return (
    name.includes(term) ||
    (folded.length > 0 && fold(name).includes(folded)) ||
    email.includes(term) ||
    String(row.uid ?? '').toLowerCase() === term
  );
}

// Names that START with the term first, then alphabetical — the social
// search's own order (functions/userSearch.js).
function rank(rows, term) {
  return [...rows].sort((a, b) => {
    const an = String(a.displayName ?? '').toLowerCase();
    const bn = String(b.displayName ?? '').toLowerCase();
    const ap = an.startsWith(term);
    const bp = bn.startsWith(term);
    if (ap !== bp) return ap ? -1 : 1;
    return an.localeCompare(bn);
  });
}

function UserSearch({ ops, directory, onPick, disabled }) {
  const [term, setTerm] = useState('');
  const [remote, setRemote] = useState({ term: '', rows: [], error: null });
  const [searching, setSearching] = useState(false);
  const requestId = useRef(0);
  const query = term.trim().toLowerCase();
  const active = query.length >= MIN_TERM;

  const local = useMemo(() => {
    if (!active) return [];
    const folded = fold(query);
    return rank(
      directory.filter((row) => matchesTerm(row, query, folded)),
      query,
    );
  }, [directory, query, active]);

  // What the debounced search reads when it fires. A ref rather than
  // dependencies, because `ops` is rebuilt whenever `busy` flips (every
  // call), and the directory array can be rebuilt on any re-render — as
  // dependencies either would restart the debounce mid-flight, discard the
  // answer as stale, and search again forever. The term is the only thing
  // a search should ever re-run for.
  const latest = useRef({ findUsers: ops.findUsers, local, directorySize: directory.length });
  useEffect(() => {
    latest.current = { findUsers: ops.findUsers, local, directorySize: directory.length };
  });

  useEffect(() => {
    if (!active) {
      setSearching(false);
      setRemote({ term: '', rows: [], error: null });
      return undefined;
    }
    const id = ++requestId.current;
    setSearching(true);
    const t = setTimeout(async () => {
      const { findUsers, local: localRows, directorySize } = latest.current;
      // Debug trail, per request: what was searched, what the directory
      // held, what matched here, then what the server returned.
      console.log('[God mode] user search', {
        term: query,
        directory: directorySize,
        localMatches: localRows.map((r) => `${r.displayName} (${r.uid})`),
      });
      try {
        const out = await findUsers(query);
        if (id !== requestId.current) return;
        console.log('[God mode] server results', out?.results ?? out);
        setRemote({ term: query, rows: out?.results ?? [], error: null });
      } catch (err) {
        if (id !== requestId.current) return;
        console.log('[God mode] server search failed', err.message);
        setRemote({ term: query, rows: [], error: err.message });
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, active]);

  const results = useMemo(() => {
    const seen = new Set(local.map((r) => r.uid));
    const extra = remote.term === query ? remote.rows.filter((r) => !seen.has(r.uid)) : [];
    return [...local, ...extra].slice(0, MAX_RESULTS);
  }, [local, remote, query]);

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Find a user</span>
        <input
          id="target-search"
          className={INPUT}
          value={term}
          disabled={disabled}
          placeholder="Name, username, email or user ID"
          autoComplete="off"
          onChange={(e) => setTerm(e.target.value)}
        />
      </label>
      {active && (
        <ul id="target-results" className="flex flex-col gap-1" aria-label="Matching accounts">
          {results.length === 0 && (
            <li className="px-1 py-1 text-xs text-neutral-500">
              {searching ? 'Searching…' : `No account matches “${term.trim()}”.`}
            </li>
          )}
          {results.map((row) => (
            <li key={row.uid}>
              <button
                type="button"
                onClick={() => {
                  setTerm('');
                  onPick(row);
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-white/[0.07] px-3 py-2 text-left transition hover:bg-white/[0.04] active:scale-[0.99]"
              >
                <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
                  <JimmyAvatar
                    mascot={row.mascot ?? 'jimmy'}
                    evolutionStage={1}
                    crop="head"
                    className="h-full w-full"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-neutral-50">
                    {row.displayName || '(no name)'}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-neutral-500">
                    {row.email ? `${row.email} · ` : ''}
                    {row.uid}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <Chip>{MASCOT_NAMES[row.mascot] ?? 'Jimmy'}</Chip>
                  {row.role === 'trainer' && <Chip tone="accent">coach</Chip>}
                  <Chip>{fmt(row.coins)} 🪙</Chip>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {active && remote.term === query && remote.error && (
        <p className="text-[11px] leading-snug text-amber-300/80">
          Server search unavailable ({remote.error}).{' '}
          {directory.length > 0
            ? `Showing matches from the ${fmt(directory.length)} accounts the console has loaded.`
            : 'The console has not loaded its directory yet — refresh, or deploy functions.'}
        </p>
      )}
    </div>
  );
}

// ── The dossier ──────────────────────────────────────────────────────────
function Dossier({ profile, loading, onRefresh, onClear }) {
  if (!profile) return null;
  const scaleLabel = profile.scale === 1 ? '×1 ladder' : `×${profile.scale} ladder`;
  const mascotHow = profile.mascotExplicit ? 'chosen' : 'by gender';
  const drift =
    (profile.recordsVolume != null && Math.abs(profile.recordsVolume - profile.volume) > 1) ||
    (profile.summaryVolume != null && Math.abs(profile.summaryVolume - profile.volume) > 1);
  return (
    <div id="target-dossier" className={`${CARD} flex flex-col gap-3 p-4`}>
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.05]">
          <JimmyAvatar mascot={profile.mascot} evolutionStage={profile.stage} crop="head" className="h-full w-full" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h4 className="text-lg font-bold leading-tight text-neutral-50">{profile.displayName || '(no name)'}</h4>
            {profile.role === 'trainer' && <Chip tone="accent">coach</Chip>}
            {profile.auth === null && (
              <Chip tone="bad" title="No Auth account behind this document — see functions/liveUsers.js">
                orphan
              </Chip>
            )}
            {profile.auth?.disabled && <Chip tone="bad">disabled</Chip>}
            {profile.auth && !profile.auth.emailVerified && <Chip tone="warn">unverified</Chip>}
          </div>
          <p className="truncate font-mono text-[11px] text-neutral-500" title={profile.uid}>
            {profile.uid}
          </p>
          {profile.email && <p className="truncate text-xs text-neutral-400">{profile.email}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            id="target-refresh"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-neutral-300 transition active:scale-95 disabled:opacity-50"
          >
            {loading ? '…' : 'Refresh'}
          </button>
          <button
            type="button"
            id="target-clear"
            onClick={onClear}
            aria-label="Clear selected user"
            className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-neutral-300 transition active:scale-95"
          >
            ✕
          </button>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {[
          ['Coins', `${fmt(profile.coins)} 🪙`],
          ['Tier', `${profile.tier} · stage ${profile.stage}`],
          ['Character', `${MASCOT_NAMES[profile.mascot] ?? profile.mascot} · ${mascotHow}`],
          ['Ladder', `${scaleLabel}${profile.gender ? ` · ${profile.gender}` : ''}`],
          ['Volume', `${fmt(profile.volume)} pts`],
          ['Workouts', profile.workoutCount == null ? '—' : fmt(profile.workoutCount)],
          ['Streak', `${fmt(profile.currentStreak)} d · trained ${dateLabel(profile.lastWorkoutAt)}`],
          ['Badges', fmt(profile.badgeCount)],
          [
            'Last message',
            profile.lastMessage
              ? profile.lastMessage.readAt
                ? `read ${dateLabel(profile.lastMessage.readAt)}`
                : `unread · sent ${dateLabel(profile.lastMessage.createdAt)}`
              : 'none',
          ],
          ['Last sign-in', profile.auth ? dateLabel(profile.auth.lastSignInAt) : '—'],
          [
            'Last grant',
            profile.lastAdminGrant
              ? `${profile.lastAdminGrant.coins > 0 ? '+' : ''}${fmt(profile.lastAdminGrant.coins)} 🪙 · ${dateLabel(profile.lastAdminGrant.at)}`
              : 'none',
          ],
          ['Joined', dateLabel(profile.createdAt)],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className={LABEL}>{k}</dt>
            <dd className="truncate text-sm font-semibold tabular-nums text-neutral-100" title={String(v)}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      {drift && (
        <p className="text-[11px] leading-snug text-amber-300/90">
          The mirrors disagree: records {fmt(profile.recordsVolume)} · summary {fmt(profile.summaryVolume)} · their
          screen {fmt(profile.volume)}. A tier shift below rewrites all three to one number.
        </p>
      )}
    </div>
  );
}

// ── The four actions ─────────────────────────────────────────────────────
function MessageForm({ ops, profile, onDone }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [result, setResult] = useState(null);
  const busy = ops.busy === 'adminMessageUser';
  const send = async () => {
    setResult(null);
    try {
      const out = await ops.messageUser({ uid: profile.uid, title, body });
      setResult({
        tone: 'ok',
        text: `Sent. ${out.displayName ?? profile.uid} sees it the next time they open the app.`,
      });
      setTitle('');
      setBody('');
      onDone();
    } catch (err) {
      setResult({ tone: 'bad', text: err.message });
    }
  };
  return (
    <Panel eyebrow="Direct message" title="Message this user">
      <p className="text-xs leading-snug text-neutral-500">
        Opens as a sheet over the app the next time they load it, and lands in their notifications as a push.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Title (optional)</span>
        <input
          id="dm-title"
          className={INPUT}
          value={title}
          maxLength={MESSAGE_TITLE_MAX}
          placeholder="A message from Jimmy 🐐"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Message</span>
        <textarea
          id="dm-body"
          className={`${INPUT} min-h-[96px] resize-y`}
          value={body}
          maxLength={MESSAGE_BODY_MAX}
          placeholder="Hey — saw you hit Titan. Your squat form video was great; keep going."
          onChange={(e) => setBody(e.target.value)}
        />
        <span className="text-right text-[10px] tabular-nums text-neutral-600">
          {body.length}/{MESSAGE_BODY_MAX}
        </span>
      </label>
      <div>
        <Button id="dm-send" onClick={send} disabled={busy || !body.trim()}>
          {busy ? 'Sending…' : `Send to ${profile.displayName || 'this user'}`}
        </Button>
      </div>
      {result && <Notice tone={result.tone}>{result.text}</Notice>}
    </Panel>
  );
}

function CoinsForm({ ops, profile, onDone }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState(null);
  const busy = ops.busy === 'adminAdjustCoins';
  const value = Math.floor(Number(amount));
  const valid = Number.isFinite(value) && value >= 1;
  const after = (sign) => Math.max(0, profile.coins + sign * value);

  const run = async (sign) => {
    setResult(null);
    try {
      const out = await ops.adjustCoins({ uid: profile.uid, delta: sign * value, note });
      setResult({
        tone: 'ok',
        text: `${out.applied >= 0 ? 'Deposited' : 'Deducted'} ${fmt(Math.abs(out.applied))} coins: ${fmt(out.before)} → ${fmt(out.after)}.${
          Math.abs(out.applied) < value ? ' Stopped at zero.' : ''
        }`,
      });
      setAmount('');
      onDone();
    } catch (err) {
      setResult({ tone: 'bad', text: err.message });
    }
  };

  return (
    <Panel eyebrow="Economy" title="Add or remove coins">
      <p className="text-xs leading-snug text-neutral-500">
        Straight onto the balance. A deduction stops at zero and is recorded on the account like any grant.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Amount</span>
          <input
            id="coins-amount"
            className={INPUT}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={amount}
            placeholder="250"
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Note</span>
          <input
            id="coins-note"
            className={INPUT}
            value={note}
            maxLength={NOTE_MAX}
            placeholder="Support: refund"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button id="coins-deposit" onClick={() => run(1)} disabled={busy || !valid}>
          {busy ? 'Working…' : `Deposit ${valid ? fmt(value) : '…'}`}
        </Button>
        <Button id="coins-deduct" tone="danger" onClick={() => run(-1)} disabled={busy || !valid}>
          {`Deduct ${valid ? fmt(value) : '…'}`}
        </Button>
        {valid && (
          <span className="text-[11px] tabular-nums text-neutral-500">
            {fmt(profile.coins)} → {fmt(after(1))} or {fmt(after(-1))}
          </span>
        )}
      </div>
      {result && <Notice tone={result.tone}>{result.text}</Notice>}
    </Panel>
  );
}

function EvolutionForm({ ops, profile, onDone }) {
  const [result, setResult] = useState(null);
  const busy = ops.busy === 'adminShiftEvolution';
  const preview = (direction) => {
    const stage = profile.stage + direction;
    if (stage > MAX_STAGE || stage < profile.minStage) return null;
    const tier = EVOLUTION_TIERS.find((t) => t.stage === stage);
    return { tier, volume: Math.round((tier.threshold * profile.scale + 1) * 100) / 100 };
  };
  const up = preview(1);
  const down = preview(-1);

  const run = async (direction) => {
    setResult(null);
    try {
      const out = await ops.shiftEvolution({ uid: profile.uid, direction });
      setResult({
        tone: 'ok',
        text: `${out.from.label} → ${out.to.label}. Volume ${fmt(out.volumeBefore)} → ${fmt(out.volumeAfter)} pts (${out.delta > 0 ? '+' : ''}${fmt(out.delta)}), written as an adjustment entry plus both mirrors.`,
      });
      onDone();
    } catch (err) {
      setResult({ tone: 'bad', text: err.message });
    }
  };

  return (
    <Panel eyebrow="Evolution" title="Force a tier">
      <p className="text-xs leading-snug text-neutral-500">
        There is no level field: a tier is earned by lifetime volume, so a shift sets their volume one point past the
        target tier's threshold on their own ladder — the adjustment entry, the records aggregate and the friend-visible
        copy, the same three writes the admin tool makes. No coins, badges, feed post or evolution notice follow.
      </p>
      <p className="text-sm text-neutral-200">
        Now <strong className="text-neutral-50">{profile.tier}</strong> (stage {profile.stage}) at {fmt(profile.volume)}{' '}
        pts on the ×{profile.scale} ladder.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button id="evolve-up" onClick={() => run(1)} disabled={busy || !up}>
          {busy ? 'Working…' : up ? `+1 → ${up.tier.label}` : 'Already at the top'}
        </Button>
        <Button id="evolve-down" tone="danger" onClick={() => run(-1)} disabled={busy || !down}>
          {down
            ? `−1 → ${down.tier.label}`
            : profile.minStage > 1
              ? 'Coach floor reached'
              : 'Already at the first tier'}
        </Button>
      </div>
      {(up || down) && (
        <p className="text-[11px] tabular-nums text-neutral-500">
          {up && `Up sets volume to ${fmt(up.volume)} pts`}
          {up && down && ' · '}
          {down && `down sets it to ${fmt(down.volume)} pts`}.
        </p>
      )}
      {result && <Notice tone={result.tone}>{result.text}</Notice>}
    </Panel>
  );
}

function MascotForm({ ops, profile, onDone }) {
  const [choice, setChoice] = useState(profile.mascot);
  const [result, setResult] = useState(null);
  // Follow the stored character when the dossier re-reads (after a swap,
  // or a refresh) without remounting, so the result notice survives.
  const [prevMascot, setPrevMascot] = useState(profile.mascot);
  if (profile.mascot !== prevMascot) {
    setPrevMascot(profile.mascot);
    setChoice(profile.mascot);
  }
  const busy = ops.busy === 'adminSetMascot';
  const changed = choice !== profile.mascot;
  const nextScale = progressionScale({ mascot: choice });
  const tierNow = tierAt(profile.volume, profile.minStage, profile.scale);
  const tierNext = tierAt(profile.volume, profile.minStage, nextScale);

  const run = async () => {
    setResult(null);
    try {
      const out = await ops.setMascot({ uid: profile.uid, mascot: choice });
      const badges = out.newBadges?.length
        ? ` ${out.newBadges.length} badge${out.newBadges.length === 1 ? '' : 's'} from the new tree awarded at once.`
        : '';
      setResult({
        tone: 'ok',
        text: `Now ${MASCOT_NAMES[out.mascot]}: ladder ×${out.before.scale} → ×${out.after.scale}, ${out.before.tier} → ${out.after.tier}. Summary${out.summaryUpdated ? '' : ' (none yet)'} and ${fmt(out.postsUpdated)} feed posts re-published.${badges}`,
      });
      onDone();
    } catch (err) {
      setResult({ tone: 'bad', text: err.message });
    }
  };

  return (
    <Panel eyebrow="Mascot" title="Swap character">
      <p className="text-xs leading-snug text-neutral-500">
        The ladder, the coin rate and the badge tree follow the character. Switching re-publishes the character and the
        ladder on their summary and every feed post, and awards at once any badge the new tree already earns from their
        records. Gender stays as answered at onboarding. Badges already held are never removed.
      </p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Character">
        {['jimmy', 'gena'].map((id) => (
          <button
            key={id}
            type="button"
            id={`mascot-${id}`}
            role="radio"
            aria-checked={choice === id}
            onClick={() => setChoice(id)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
              choice === id
                ? 'border-[var(--tier-accent)] bg-[color-mix(in_srgb,var(--tier-accent)_16%,transparent)] text-neutral-50'
                : 'border-white/[0.07] text-neutral-400'
            }`}
          >
            <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
              <JimmyAvatar mascot={id} evolutionStage={profile.stage} crop="head" className="h-full w-full" />
            </span>
            <span>
              {MASCOT_NAMES[id]}
              {profile.mascot === id && <span className="block text-[10px] font-normal text-neutral-500">current</span>}
            </span>
          </button>
        ))}
      </div>
      {changed && (
        <p className="text-[11px] leading-snug tabular-nums text-neutral-400">
          Ladder ×{profile.scale} → ×{nextScale} · {tierNow.label} → {tierNext.label} at {fmt(profile.volume)} pts ·
          coins ×{Math.round((1 / nextScale) * 100) / 100} per session from the next workout.
        </p>
      )}
      <div>
        <Button id="mascot-apply" onClick={run} disabled={busy || !changed}>
          {busy ? 'Switching…' : changed ? `Switch to ${MASCOT_NAMES[choice]}` : `Already ${MASCOT_NAMES[choice]}`}
        </Button>
      </div>
      {result && <Notice tone={result.tone}>{result.text}</Notice>}
    </Panel>
  );
}

// ── The module ───────────────────────────────────────────────────────────
export default function UserActionsPanel({ ops, analytics }) {
  const [selected, setSelected] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const load = async (uid) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const out = await ops.userProfile(uid);
      if (id !== requestId.current) return;
      setProfile(out);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err.message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  const pick = (row) => {
    setSelected(row);
    setProfile(null);
    load(row.uid);
  };
  const clear = () => {
    requestId.current += 1;
    setSelected(null);
    setProfile(null);
    setError(null);
    setLoading(false);
  };
  const refresh = () => selected && load(selected.uid);
  // The console's own rows double as the search directory — see UserSearch.
  const directory = useMemo(() => analytics?.data?.powerUsers ?? [], [analytics?.data?.powerUsers]);

  return (
    <Panel
      eyebrow="Targeted user actions"
      title="God mode: one account"
      aside={selected && <Chip tone="accent">{selected.displayName || selected.uid}</Chip>}
      className="lg:col-span-2"
    >
      <p className="text-xs leading-snug text-neutral-500">
        Pick an account, read its dossier, then act on it. Each action re-checks that you are the admin on the server
        and re-reads the dossier afterwards, so what you see is what is stored.
      </p>
      <UserSearch ops={ops} directory={directory} onPick={pick} disabled={loading} />
      {selected && !profile && loading && <p className="text-xs text-neutral-500">Loading {selected.displayName}…</p>}
      {error && <Notice tone="bad">{error}</Notice>}
      <Dossier profile={profile} loading={loading} onRefresh={refresh} onClear={clear} />
      {profile && (
        <div className="grid gap-4 lg:grid-cols-2">
          <MessageForm key={`m-${profile.uid}`} ops={ops} profile={profile} onDone={refresh} />
          <CoinsForm key={`c-${profile.uid}`} ops={ops} profile={profile} onDone={refresh} />
          <EvolutionForm key={`e-${profile.uid}`} ops={ops} profile={profile} onDone={refresh} />
          <MascotForm key={`s-${profile.uid}`} ops={ops} profile={profile} onDone={refresh} />
        </div>
      )}
    </Panel>
  );
}
