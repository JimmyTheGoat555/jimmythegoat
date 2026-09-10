import { useState } from 'react';
import { NUDGE_MESSAGES } from '../../data/nudgeMessages';

// A bottom-sheet-style picker for the fixed set of nudge lines — same
// overlay language as ConfirmDialog/SettingsPanel elsewhere in the app
// (dark scrim, rounded card, click-outside or ✕ to close). Free text isn't
// offered on purpose: see functions/nudgeMessages.js for why this list is
// closed rather than an input box.
export default function NudgeModal({ friendName, onSend, onClose }) {
  const [sendingId, setSendingId] = useState(null);
  const [sentId, setSentId] = useState(null);
  const [error, setError] = useState(null);

  const handlePick = async (messageId) => {
    setError(null);
    setSendingId(messageId);
    try {
      await onSend(messageId);
      setSentId(messageId);
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err.message ?? 'Could not send — try again.');
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl bg-neutral-950 border border-white/10 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-neutral-950 flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/10">
          <div>
            <h2 className="text-xl font-bold text-neutral-50">Nudge {friendName}</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Pick one — Jimmy will deliver it.</p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-500 text-2xl leading-none px-1">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-2">
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
          {NUDGE_MESSAGES.map((msg) => {
            const isThisSending = sendingId === msg.id;
            const isThisSent = sentId === msg.id;
            return (
              <button
                key={msg.id}
                type="button"
                onClick={() => handlePick(msg.id)}
                disabled={sendingId !== null || sentId !== null}
                className={`text-left text-sm rounded-xl px-3.5 py-3 border transition disabled:opacity-50 ${
                  isThisSent
                    ? 'bg-[var(--success)]/15 border-[var(--success)]/30 text-[var(--success)]'
                    : 'bg-white/5 border-white/10 text-neutral-200'
                }`}
              >
                {isThisSent ? '✓ Sent!' : isThisSending ? 'Sending…' : msg.text}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
