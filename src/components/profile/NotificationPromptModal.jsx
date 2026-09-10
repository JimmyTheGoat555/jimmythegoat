import { useState } from 'react';
import { enablePushNotifications } from '../../lib/messaging';

// Shown once, the first time someone reaches the main app after signing
// up/in on a device — a friendlier, explained "soft ask" before the
// browser's own blunt permission dialog, since a bare OS prompt with no
// context is an easy instinctive "Don't Allow." Tapping "Enable
// Notifications" here is what actually triggers that real permission
// dialog (enablePushNotifications() needs a genuine user gesture on iOS,
// which this tap provides — the modal isn't a substitute for it, just the
// pitch before it). Dismissing either way marks it seen so it never nags
// again on this device.
export default function NotificationPromptModal({ uid, onDismiss }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleEnable = async () => {
    setBusy(true);
    setError(null);
    const result = await enablePushNotifications(uid);
    setBusy(false);
    if (result.ok) {
      onDismiss();
    } else {
      // Stay open on failure (denied, unsupported, etc.) so the reason is
      // actually visible instead of just silently closing — same
      // "never fail silently" rule the Profile button follows.
      setError(result.reason);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-5">
      <div className="w-full max-w-xs card p-6 flex flex-col gap-4 text-center">
        <p className="text-4xl">🔔</p>
        <div>
          <h2 className="text-2xl text-neutral-50">Stay In The Loop</h2>
          <p className="text-sm text-neutral-400 mt-2">
            Get a nudge on your weekly weigh-in day, and hear from your trainer the moment they check in on you. You
            can turn this off anytime from your profile.
          </p>
        </div>

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

        <button
          type="button"
          onClick={handleEnable}
          disabled={busy}
          className="btn-arcade w-full py-3.5 text-base disabled:opacity-60"
        >
          {busy ? 'Enabling…' : '🔔 Enable Notifications'}
        </button>
        <button type="button" onClick={onDismiss} className="text-sm text-neutral-500">
          Not Now
        </button>
      </div>
    </div>
  );
}
