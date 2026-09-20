import { useState } from 'react';
import { Button, INPUT, LABEL, Panel, fmt } from './consoleUi';
import UserActionsPanel from './UserActionsPanel';

// Tab 3 — Operations. The global actions — the announcement, and a coin
// or XP grant to one account or to everyone — through the admin-only
// callables in functions/adminOps.js (hooks/useAdminOps.js), which
// re-check the caller and cap every amount; this panel adds the one
// thing a server cannot — a moment to read what is about to happen. A
// global grant asks twice. Below them, the targeted module
// (UserActionsPanel.jsx): one account, its dossier, and four actions on
// it, through functions/adminUserActions.js.

const ANNOUNCEMENT_TITLE_MAX = 80;
const ANNOUNCEMENT_BODY_MAX = 280;

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

function AnnouncementForm({ ops }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [active, setActive] = useState(true);
  const [result, setResult] = useState(null);

  const submit = async (nextActive) => {
    setResult(null);
    try {
      const doc = await ops.setAnnouncement({ title, body, active: nextActive });
      setResult({
        tone: 'ok',
        text: doc.active
          ? `Live. Every signed-in user sees “${doc.title || doc.body}” until they dismiss it.`
          : 'Banner switched off for everyone.',
      });
    } catch (err) {
      setResult({ tone: 'bad', text: err.message });
    }
  };

  const busy = ops.busy === 'adminSetAnnouncement';
  return (
    <Panel eyebrow="Global announcements" title="Broadcast a banner">
      <p className="text-xs leading-snug text-neutral-500">
        Renders under the top bar for every user, on their next load or live if the app is open, until each of them
        dismisses it. Publishing new text starts a fresh banner for people who closed the old one.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Title</span>
        <input
          id="announcement-title"
          className={INPUT}
          value={title}
          maxLength={ANNOUNCEMENT_TITLE_MAX}
          placeholder="New features added!"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Message</span>
        <textarea
          id="announcement-body"
          className={`${INPUT} min-h-[84px] resize-y`}
          value={body}
          maxLength={ANNOUNCEMENT_BODY_MAX}
          placeholder="Nine sticker themes, a black Polaroid, and coaching when you cruise past 12 reps."
          onChange={(e) => setBody(e.target.value)}
        />
        <span className="text-right text-[10px] tabular-nums text-neutral-600">
          {body.length}/{ANNOUNCEMENT_BODY_MAX}
        </span>
      </label>
      <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] px-3 py-2.5">
        <span className="text-sm text-neutral-200">Show to everyone</span>
        <input
          id="announcement-active"
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-5 w-5 accent-[var(--tier-accent)]"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          id="announcement-publish"
          onClick={() => submit(active)}
          disabled={busy || (!title.trim() && !body.trim() && active)}
        >
          {busy ? 'Publishing…' : active ? 'Publish banner' : 'Save (hidden)'}
        </Button>
        <Button tone="ghost" onClick={() => submit(false)} disabled={busy}>
          Take banner down
        </Button>
      </div>
      {result && <Notice tone={result.tone}>{result.text}</Notice>}
    </Panel>
  );
}

function GrantForm({ ops, liveUsers }) {
  const [kind, setKind] = useState('coins');
  const [scope, setScope] = useState('user');
  const [uid, setUid] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState(null);

  const value = Math.floor(Number(amount));
  const valid = Number.isFinite(value) && value >= 1 && (scope === 'all' || uid.trim());
  const busy = ops.busy === 'adminGrantCoins' || ops.busy === 'adminGrantXp';
  const unit = kind === 'coins' ? 'coins' : 'XP';

  const run = async () => {
    setConfirming(false);
    setResult(null);
    try {
      const target = scope === 'all' ? 'all' : uid.trim();
      const payload = kind === 'coins' ? { target, coins: value, note } : { target, points: value, note };
      const out = kind === 'coins' ? await ops.grantCoins(payload) : await ops.grantXp(payload);
      const who = out.accounts === 1 ? (out.displayName ?? uid.trim()) : `${fmt(out.accounts)} accounts`;
      setResult({
        tone: 'ok',
        text: `Granted ${fmt(value)} ${unit} to ${who}.${out.capped ? ' Reached the per-call cap — run again for the rest.' : ''}`,
      });
    } catch (err) {
      setResult({ tone: 'bad', text: err.message });
    }
  };

  return (
    <Panel eyebrow="Economy injection" title="Grant coins or XP">
      <p className="text-xs leading-snug text-neutral-500">
        Coins land on the balance at once. XP is Relative Strength Volume: it is written as a verified adjustment entry
        plus the aggregate and the friend-visible copy, the same three writes the admin tool makes, so the tier moves on
        every screen. No coins, badges, feed post or evolution notice follow an XP grant.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {[
          ['coins', '🪙 Coins'],
          ['xp', '⚡ XP'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setKind(id)}
            aria-pressed={kind === id}
            className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${kind === id ? 'border-[var(--tier-accent)] bg-[color-mix(in_srgb,var(--tier-accent)_16%,transparent)] text-neutral-50' : 'border-white/[0.07] text-neutral-400'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          ['user', 'One user'],
          ['all', 'Everyone'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setScope(id)}
            aria-pressed={scope === id}
            className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${scope === id ? 'border-[var(--tier-accent)] bg-[color-mix(in_srgb,var(--tier-accent)_16%,transparent)] text-neutral-50' : 'border-white/[0.07] text-neutral-400'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {scope === 'user' && (
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>User ID</span>
          <input
            id="grant-uid"
            className={`${INPUT} font-mono text-xs`}
            value={uid}
            placeholder="The Firebase uid — copy it from the Power Users table's mailto or the console"
            onChange={(e) => setUid(e.target.value)}
          />
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Amount ({unit})</span>
          <input
            id="grant-amount"
            className={INPUT}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={amount}
            placeholder={kind === 'coins' ? '250' : '400'}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Note</span>
          <input
            id="grant-note"
            className={INPUT}
            value={note}
            maxLength={120}
            placeholder="Launch week gift"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          id="grant-submit"
          tone={scope === 'all' ? 'danger' : 'primary'}
          onClick={() => (scope === 'all' ? setConfirming(true) : run())}
          disabled={busy || !valid}
        >
          {busy
            ? 'Granting…'
            : scope === 'all'
              ? `Grant ${valid ? fmt(value) : '…'} ${unit} to everyone`
              : `Grant ${valid ? fmt(value) : '…'} ${unit}`}
        </Button>
        {scope === 'all' && liveUsers != null && (
          <span className="text-[11px] text-neutral-500">{fmt(liveUsers)} live accounts</span>
        )}
      </div>
      {confirming && (
        <div className="flex flex-col gap-2 rounded-xl border border-[color-mix(in_srgb,var(--danger)_60%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-3">
          <p className="text-sm font-semibold text-neutral-50">
            Give {fmt(value)} {unit} to every live account{liveUsers != null ? ` (${fmt(liveUsers)})` : ''}?
          </p>
          <p className="text-xs text-neutral-400">This cannot be undone from the console.</p>
          <div className="flex gap-2">
            <Button id="grant-confirm" tone="danger" onClick={run}>
              Yes, grant to everyone
            </Button>
            <Button tone="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {result && <Notice tone={result.tone}>{result.text}</Notice>}
    </Panel>
  );
}

export default function OperationsPanel({ ops, analytics }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AnnouncementForm ops={ops} />
      <GrantForm ops={ops} liveUsers={analytics?.data?.totals?.users ?? null} />
      <UserActionsPanel ops={ops} analytics={analytics} />
    </div>
  );
}
