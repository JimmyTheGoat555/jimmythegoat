import { useState } from 'react';
import BottomSheet from './BottomSheet';
import JimmyAvatar from '../evolution/JimmyAvatar';

// A direct message from the founder, as the app's bottom sheet. Pure —
// FounderMessageModal.jsx feeds it the live hook, dev/message.jsx a
// fixture. `message` is { id, title, body, createdAt } or null; `onRead`
// fires on any close (the button, the backdrop, the handle, Escape),
// because there is nothing to decide here — reading it is the action.

function sentLabel(iso) {
  const ms = Date.parse(iso ?? '');
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function FounderMessageSheet({ message, onRead }) {
  // The last message stays mounted while the sheet slides out, so the
  // text does not vanish the instant it starts to move.
  const [shown, setShown] = useState(message);
  if (message && message !== shown) setShown(message);
  const m = message ?? shown;
  const when = sentLabel(m?.createdAt);

  return (
    <BottomSheet open={Boolean(message)} onClose={onRead} compact>
      {m && (
        <div className="flex flex-col gap-4 pt-1" data-testid="founder-message">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border"
              style={{
                borderColor: 'color-mix(in srgb, var(--tier-accent) 55%, transparent)',
                background: 'color-mix(in srgb, var(--tier-accent) 14%, rgba(255,255,255,0.04))',
              }}
              aria-hidden="true"
            >
              <JimmyAvatar mascot="jimmy" evolutionStage={4} crop="head" className="h-full w-full" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                From the founder{when ? ` · ${when}` : ''}
              </p>
              <h2 className="text-lg font-bold leading-tight text-neutral-50" style={{ textWrap: 'balance' }}>
                {m.title || 'A message from Jimmy 🐐'}
              </h2>
            </div>
          </div>
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-neutral-200">{m.body}</p>
          <button
            type="button"
            id="founder-message-read"
            onClick={onRead}
            className="rounded-2xl px-4 py-3 text-sm font-bold transition active:scale-[0.98]"
            style={{ background: 'var(--tier-accent)', color: 'var(--color-jimmy-950)' }}
          >
            Got it
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
