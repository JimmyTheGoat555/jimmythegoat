// A real in-app confirmation sheet, used anywhere the app needs a "are you
// sure?" before a destructive action (discarding a workout, deleting one).
// Deliberately NOT window.confirm(): native confirm() is unreliable inside
// an installed PWA on some platforms — it can silently resolve to `false`
// without ever showing anything, which made "Cancel" on an active workout
// look completely broken.
export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6" onClick={onCancel}>
      <div className="w-full max-w-xs card p-5 flex flex-col gap-4 text-center" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="text-lg font-bold text-neutral-50">{title}</p>
          {message && <p className="text-sm text-neutral-500 mt-1">{message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full bg-[var(--danger)] text-white font-semibold text-base py-3.5 rounded-2xl active:scale-[0.97] transition"
          >
            {confirmLabel}
          </button>
          <button type="button" onClick={onCancel} className="w-full text-neutral-400 font-medium text-base py-2">
            Never mind
          </button>
        </div>
      </div>
    </div>
  );
}
