import { useState } from 'react';
import BottomSheet from '../shared/BottomSheet';
import { isBlocked, REPORT_REASONS } from '../../utils/moderation';

// The Block / Report / Unblock sheet. Rendered ONCE, by ModerationProvider
// (context/Moderation.jsx), rather than by each ⋯ button — and that is not
// tidiness, it is a bug fix found by using the thing:
//
// blocking somebody from a list removes their row on the next render, and
// a sheet owned by that row unmounts with it. The block still landed, but
// the confirmation vanished mid-animation, and "Report sent" — the one
// message a reporter actually needs, since reporting alone changes nothing
// they can see — was never readable at all. One sheet above the lists
// outlives the row it was opened from.
//
// It takes `actions` as a prop instead of reading the context it is
// rendered inside: the provider has the value already, and importing the
// context here would make the two files import each other.

const MAX_DETAILS = 300;

// A full-width row in the sheet. Destructive actions are danger-coloured
// text on glass rather than a solid red button: there are two of them
// stacked, and two solid warning buttons read as an emergency.
function SheetAction({ onClick, tone = 'neutral', children, hint }) {
  const color =
    tone === 'danger' ? 'text-[var(--danger)]' : tone === 'ember' ? 'text-[var(--ember)]' : 'text-neutral-100';
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-0.5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-left transition active:scale-[0.98]"
    >
      <span className={`text-base font-semibold ${color}`}>{children}</span>
      {hint && <span className="text-xs text-neutral-500">{hint}</span>}
    </button>
  );
}

export default function UserActionsSheet({ open, target, actions, onClose }) {
  // 'menu' → 'block' | 'report' → 'done'. One sheet that changes its mind
  // rather than a stack of them: a confirmation that arrives as a second
  // overlay on top of the first is the thing people tap through blind.
  const [view, setView] = useState('menu');
  const [reason, setReason] = useState(REPORT_REASONS[0].id);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const targetUid = target?.targetUid ?? null;
  const targetName = target?.targetName ?? 'this account';
  const surface = target?.surface ?? '';
  // Live, not captured when the sheet opened: blocking from the menu has
  // to flip this so the 'done' view and a re-open both say the right thing.
  const blocked = isBlocked(actions.blockedUids, targetUid);

  const close = () => {
    onClose();
    // Reset AFTER the sheet has animated out, so the content does not
    // visibly snap back to the menu on the way down.
    window.setTimeout(() => {
      setView('menu');
      setReason(REPORT_REASONS[0].id);
      setDetails('');
      setAlsoBlock(true);
      setError(null);
      setDone(null);
    }, 350);
  };

  const run = async (action, message) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setDone(message);
      setView('done');
    } catch (err) {
      // Offline is the realistic failure for both writes. Say so on the
      // sheet — a button that silently does nothing invites a second tap,
      // and on Block that reads as "it didn't work".
      setError(err?.message ?? "Couldn't do that — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!targetUid) return null;

  return (
    <BottomSheet open={open} onClose={close} title={view === 'report' ? `Report ${targetName}` : targetName} compact>
      {view === 'menu' && (
        <div className="flex flex-col gap-2 pt-1">
          {blocked ? (
            <SheetAction
              tone="ember"
              onClick={() => run(() => actions.unblockUser(targetUid), `${targetName} is unblocked.`)}
              hint="Their workouts and messages come back."
            >
              Unblock {targetName}
            </SheetAction>
          ) : (
            <SheetAction tone="danger" onClick={() => setView('block')} hint="Hides everything they post or send you.">
              Block {targetName}
            </SheetAction>
          )}
          <SheetAction tone="danger" onClick={() => setView('report')} hint="Tell us what is wrong with this account.">
            Report {targetName}
          </SheetAction>
          {error && <p className="px-1 pt-1 text-sm text-[var(--danger)]">{error}</p>}
        </div>
      )}

      {view === 'block' && (
        <div className="flex flex-col gap-4 pt-1">
          <div className="flex flex-col gap-2 text-sm text-neutral-400">
            <p>
              You will stop seeing <span className="font-semibold text-neutral-200">{targetName}</span> anywhere in the
              app — their workouts, their place on the leaderboard, and anything they send you.
            </p>
            <p>You can undo this any time from Settings → Blocked accounts.</p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => actions.blockUser(targetUid), `${targetName} is blocked.`)}
              className="w-full rounded-2xl bg-[var(--danger)] py-3.5 text-base font-semibold text-white transition active:scale-[0.97] disabled:opacity-50"
            >
              {busy ? 'Blocking…' : `Block ${targetName}`}
            </button>
            <button
              type="button"
              onClick={() => setView('menu')}
              className="w-full py-2 text-base font-medium text-neutral-400"
            >
              Never mind
            </button>
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </div>
      )}

      {view === 'report' && (
        <div className="flex flex-col gap-4 pt-1">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="pb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              What is wrong?
            </legend>
            {REPORT_REASONS.map((option) => (
              <label
                key={option.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition ${
                  reason === option.id
                    ? 'border-[var(--ember)]/60 bg-[var(--ember)]/10 text-neutral-100'
                    : 'border-white/10 bg-white/5 text-neutral-300'
                }`}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={option.id}
                  checked={reason === option.id}
                  onChange={() => setReason(option.id)}
                  className="h-4 w-4 accent-[var(--ember)]"
                />
                {option.label}
              </label>
            ))}
          </fieldset>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Anything else? (optional)
            </span>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, MAX_DETAILS))}
              rows={3}
              placeholder="What happened?"
              className="w-full resize-none rounded-xl bg-neutral-800 px-3.5 py-3 text-base text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[var(--ember)]"
            />
            <span className="self-end text-[11px] tabular-nums text-neutral-600">
              {details.length}/{MAX_DETAILS}
            </span>
          </label>

          {!blocked && (
            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={alsoBlock}
                onChange={(e) => setAlsoBlock(e.target.checked)}
                className="h-4 w-4 accent-[var(--ember)]"
              />
              Block them as well
            </label>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(
                  async () => {
                    await actions.reportUser(targetUid, { reason, details, reportedName: targetName, surface });
                    // Block second, and only if the report landed: a
                    // failed report that silently blocked anyway would
                    // leave someone believing they had reported an account
                    // they had merely hidden.
                    if (alsoBlock && !blocked) await actions.blockUser(targetUid);
                  },
                  alsoBlock && !blocked ? `Report sent, and ${targetName} is blocked.` : 'Report sent.',
                )
              }
              className="w-full rounded-2xl bg-[var(--ember)] py-3.5 text-base font-semibold text-white transition active:scale-[0.97] disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send report'}
            </button>
            <button
              type="button"
              onClick={() => setView('menu')}
              className="w-full py-2 text-base font-medium text-neutral-400"
            >
              Never mind
            </button>
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </div>
      )}

      {view === 'done' && (
        <div className="flex flex-col gap-4 pt-1">
          <p className="text-sm text-neutral-300">{done}</p>
          <p className="text-xs text-neutral-500">
            Reports are reviewed by a human. We act on accounts that break the rules, and we do not tell them who
            reported them.
          </p>
          <button
            type="button"
            onClick={close}
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 text-base font-semibold text-neutral-100 transition active:scale-[0.97]"
          >
            Done
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
