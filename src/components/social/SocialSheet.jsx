// The shell both Social header modals sit in.
//
// Same bottom-sheet language as every other overlay in this app
// (NudgeModal, FriendPickerModal, BadgePickerModal): dark scrim, sheet
// from the bottom on phones, centred card from `sm` up, ✕ or a tap
// outside to close. Extracted rather than copy-pasted twice because two
// sheets opened from the same header row that scroll or round their
// corners differently look like a bug.
export default function SocialSheet({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-neutral-950 sm:max-w-sm sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-white/10 bg-neutral-950 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-neutral-50">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="px-1 text-2xl leading-none text-neutral-500">
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-4 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
