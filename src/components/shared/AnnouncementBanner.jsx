import { useAnnouncement } from '../../hooks/useAnnouncement';

// The global announcement, as a slim bar under the top HUD on every tab
// but the live workout (App.jsx's Layout decides where). Reads its own
// data (hooks/useAnnouncement.js) so mounting it is the whole
// integration; renders nothing at all when there is nothing to say or
// the reader has already closed it.
export default function AnnouncementBanner() {
  const { announcement, dismiss } = useAnnouncement();
  if (!announcement) return null;
  return (
    <div
      role="status"
      className="mx-4 mb-3 flex items-start gap-3 rounded-2xl border px-3.5 py-3 shadow-lg shadow-black/30"
      style={{
        borderColor: 'color-mix(in srgb, var(--tier-accent) 45%, transparent)',
        background: 'color-mix(in srgb, var(--tier-accent) 12%, rgba(255,255,255,0.03))',
      }}
    >
      <span className="text-lg leading-none" aria-hidden="true">
        📣
      </span>
      <div className="min-w-0 flex-1">
        {announcement.title && <p className="text-sm font-bold leading-snug text-neutral-50">{announcement.title}</p>}
        {announcement.body && <p className="mt-0.5 text-[13px] leading-snug text-neutral-300">{announcement.body}</p>}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="-mr-1 -mt-1 rounded-full p-1.5 text-neutral-400 transition active:scale-90"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
