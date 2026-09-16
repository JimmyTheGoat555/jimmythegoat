// The other half of LockerPromptModal, ninety minutes later: the last step
// of the post-workout cascade (checklist → badges → chest → this).
//
// Deliberately last and deliberately NOT a toast. A toast auto-dismisses,
// and the one thing this screen exists to do is still be there when
// someone has finished celebrating and is walking back to the changing
// room. It waits for a tap.
//
// Not lazy-loaded, for the same reason BadgeCelebrationModal isn't: a
// Suspense boundary costs a visible blank seam between cascade steps, and
// there is nothing here to defer.
export default function LockerReminderModal({ lockerNumber, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6" onClick={onClose}>
      <div className="w-full max-w-xs card p-6 flex flex-col gap-4 text-center" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="text-4xl" aria-hidden="true">
            🎒
          </p>
          <p className="text-lg font-bold text-neutral-50 mt-2">Don't forget your stuff!</p>
          <p className="text-sm text-neutral-500 mt-1">Your locker number is:</p>
          <p className="text-5xl font-black text-[var(--ember)] mt-3 tracking-widest">{lockerNumber}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full bg-[var(--ember)] text-white font-semibold text-base py-3.5 rounded-2xl active:scale-[0.97] transition"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
