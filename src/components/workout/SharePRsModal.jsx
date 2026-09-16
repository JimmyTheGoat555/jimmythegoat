import { useState } from 'react';
import { formatRecordLoad } from '../../utils/personalRecords';

// The tick inside a checked box. Inline SVG rather than a "✓" glyph: it
// inherits currentColor, and the emoji-adjacent check marks render at
// wildly different weights across platforms — next to several identical
// boxes that reads as a rendering bug.
function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// Phase 2b: which records go on the feed post, asked last and asked once.
//
// The post itself already exists by the time this opens — logWorkout wrote
// it with NO records attached, and confirming here adds the ticked ones
// (functions/publishRecords.js). That order is deliberate: the opposite
// one would put a record on a friend's live feed before its owner had been
// asked about it, and no amount of retracting afterwards un-shows it.
//
// So "Not now" is genuinely free. Nothing has been published yet.
export default function SharePRsModal({ personalRecords = [], onConfirm, onSkip }) {
  // All ticked to begin with: someone who just broke four records usually
  // wants them seen, and the workout is already a feed post either way, so
  // this is "shout about the records on it", not "reveal the workout".
  const [selected, setSelected] = useState(() => new Set(personalRecords.map((pr) => pr.exerciseId)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const toggle = (exerciseId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(exerciseId)) next.delete(exerciseId);
      else next.add(exerciseId);
      return next;
    });
  };

  const confirm = async () => {
    if (busy) return; // the network call below is not instant; one tap only
    const ids = personalRecords.map((pr) => pr.exerciseId).filter((id) => selected.has(id));
    // Nothing ticked means nothing to publish, and the post is already in
    // that state — so skip the round trip entirely rather than asking the
    // server to confirm a no-op.
    if (ids.length === 0) {
      onSkip();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onConfirm(ids);
    } catch (err) {
      // Recoverable and worth saying out loud: the workout is safely
      // logged either way, it is only the shout-out that failed.
      setError(err?.message ?? 'Could not share — try again.');
      setBusy(false);
    }
  };

  const single = personalRecords.length === 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-6">
      <div className="w-full max-w-xs card p-6 flex flex-col gap-4">
        <div className="text-center">
          <p className="text-3xl" aria-hidden="true">
            🏆
          </p>
          <p className="text-lg font-bold text-neutral-50 mt-2">
            {single ? 'New personal record!' : `${personalRecords.length} new personal records!`}
          </p>
          <p className="text-sm text-neutral-500 mt-1">
            {single ? 'Share it on your feed?' : 'Pick the ones to share on your feed.'}
          </p>
        </div>

        {/* Every row is its own checkbox, and the whole row is the hit
            target — these are small lines of text on a phone, and a 16px
            tick box alone would be a miss half the time. */}
        <ul className="flex flex-col gap-1 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-2.5">
          {personalRecords.map((pr) => {
            const chosen = selected.has(pr.exerciseId);
            return (
              <li key={pr.exerciseId}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={chosen}
                  onClick={() => toggle(pr.exerciseId)}
                  disabled={busy}
                  className="w-full flex items-start gap-2 rounded-lg px-1 py-1 text-left transition active:scale-[0.99] disabled:opacity-60"
                >
                  <span
                    className={`mt-[3px] h-4 w-4 shrink-0 rounded-md border flex items-center justify-center transition-colors ${
                      chosen ? 'bg-amber-400 border-amber-400 text-neutral-900' : 'border-amber-100/40 text-transparent'
                    }`}
                  >
                    <CheckMark />
                  </span>
                  {/* Unticked dims rather than strikes through: it is still
                      a record they set, it just isn't going on the feed. */}
                  <span className={`text-xs ${chosen ? 'text-amber-100/90' : 'text-amber-100/40'}`}>
                    <span className="font-semibold">{pr.name}</span> — {formatRecordLoad(pr)} × {pr.reps}
                    {pr.previousWeight !== undefined && (
                      <span className={chosen ? 'text-amber-100/60' : ''}> (was {pr.previousWeight} kg)</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {error && <p className="text-center text-sm text-[var(--danger)]">{error}</p>}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            aria-busy={busy}
            className="w-full bg-[var(--ember)] text-white font-semibold text-base py-3.5 rounded-2xl active:scale-[0.97] transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <span
                  className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white"
                  aria-hidden="true"
                />
                Sharing…
              </>
            ) : selected.size === 0 ? (
              'Keep them private'
            ) : selected.size === personalRecords.length ? (
              single ? 'Share it' : 'Share all'
            ) : (
              `Share ${selected.size} of ${personalRecords.length}`
            )}
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className="w-full text-neutral-500 font-medium text-sm py-2 disabled:opacity-50"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
