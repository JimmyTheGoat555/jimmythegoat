import { useState } from 'react';

// Shown immediately after logging a body-weight entry — same "confirm
// once, options folded in" pattern as the workout-finish summary modal.
// `achieved` is true when this entry's direction matches the user's
// stated fitness goal (see utils/weighIn.js's goalMatchesDelta) — that's
// the only case the Public/Private choice really changes anything visible
// elsewhere; a non-achievement entry is logged the same way either way.
// Your trainer sees every weigh-in regardless of this choice — the toggle
// only ever controls the wider "activity" visibility.
export default function WeighInModal({ deltaKg, achieved, onConfirm, onClose }) {
  const [visibility, setVisibility] = useState('private');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5" onClick={onClose}>
      <div className="w-full max-w-xs card p-6 flex flex-col gap-4 text-center" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="text-4xl">{achieved ? '🎉' : '⚖️'}</p>
          <h2 className="text-2xl text-neutral-50 mt-1">Weigh-In Logged!</h2>
          {deltaKg != null && (
            <p className="text-sm text-neutral-400 mt-1">
              {deltaKg === 0
                ? 'No change since last time.'
                : `${deltaKg > 0 ? '+' : ''}${deltaKg.toFixed(1)} kg since last time.`}
            </p>
          )}
        </div>

        {achieved && (
          <p className="text-sm font-semibold" style={{ color: 'var(--tier-accent)' }}>
            That's real progress toward your goal!
          </p>
        )}

        <div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setVisibility('private')}
              className={`py-3 rounded-2xl text-sm font-semibold transition ${
                visibility === 'private' ? 'text-white' : 'bg-neutral-800 text-neutral-400'
              }`}
              style={visibility === 'private' ? { background: 'var(--tier-accent)', color: '#000' } : undefined}
            >
              🔒 Private
            </button>
            <button
              type="button"
              onClick={() => setVisibility('public')}
              className={`py-3 rounded-2xl text-sm font-semibold transition ${
                visibility === 'public' ? 'text-white' : 'bg-neutral-800 text-neutral-400'
              }`}
              style={visibility === 'public' ? { background: 'var(--tier-accent)', color: '#000' } : undefined}
            >
              📢 Public
            </button>
          </div>
          <p className="text-xs text-neutral-500 mt-2">
            Public entries can show up on your activity. Private stays just between you and your trainer — either way,
            your trainer is updated on every weigh-in.
          </p>
        </div>

        <button type="button" onClick={() => onConfirm(visibility)} className="btn-arcade w-full py-3.5 text-base">
          Done
        </button>
      </div>
    </div>
  );
}
