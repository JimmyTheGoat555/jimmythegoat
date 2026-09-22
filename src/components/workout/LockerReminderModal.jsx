// The other half of LockerPromptModal, ninety minutes later: the FIRST
// step of the post-workout cascade (this → checklist → badges → chest).
//
// Deliberately first. It used to be last, and the reasoning then was that
// somebody reads this on the way to the changing room — but by the end of
// the cascade they are already walking, and a modal that arrives then is
// in the way rather than in time. It goes in front now, while the phone
// is still in a hand and the locker is still an arm's length away, and
// the celebration waits behind it (App.jsx's `firstStep`).
//
// Deliberately NOT a toast, which has not changed. A toast auto-dismisses,
// and a locker number nobody read is a locker number nobody has. It waits
// for a tap.
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
