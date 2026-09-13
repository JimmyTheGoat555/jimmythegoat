function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const ICONS = {
  trainee_weigh_in: '⚖️',
  weigh_in_reminder_tomorrow: '📅',
  weigh_in_reminder_today: '⏰',
  friend_nudge: '🐐',
  lazy_goat_tease: '😴',
  cheer_received: '❤️',
  friend_request: '👋',
  // The arrival ping for an item sitting in the Workout inbox above this
  // list (see WorkoutInbox.jsx) — answering it there clears this row too.
  workout_recommendation: '📋',
};

// The shared inbox surface — lives on the Social tab (see SocialPage.jsx),
// where a red badge on the tab icon points here whenever unreadCount > 0.
// A trainer sees their trainees' weigh-in updates, a trainee sees their
// own weekly reminders, and everyone sees friend nudges. Same list/row
// shape for every type; only the content and leading icon differ.
export default function NotificationsList({ notifications, onMarkRead, onDismiss }) {
  if (notifications.length === 0) {
    return <p className="text-sm text-neutral-500 text-center py-2">No notifications yet.</p>;
  }

  return (
    // Exactly three rows, then scrolls. Measured rather than guessed: a
    // two-line card (title + body + timestamp) renders at 101px and the
    // flex gap is 6px, so 3 * 101 + 2 * 6 = 314px ≈ 19.75rem.
    //
    // max-height, not height: one or two notifications still size to their
    // content instead of leaving a hole, and a short single-line
    // notification means slightly more than three fit — which is the right
    // way for it to be wrong.
    //
    // `overscroll-contain` matters more than it looks on a phone: without
    // it, flicking past the end of this list hands the momentum to the
    // page and scrolls the whole Social tab, which feels like the list
    // jumped away from your thumb.
    <ul className="flex flex-col gap-1.5 max-h-[19.75rem] overflow-y-auto overscroll-contain pr-0.5">
      {notifications.slice(0, 12).map((n) => (
        <li
          key={n.id}
          onClick={() => !n.read && onMarkRead(n.id)}
          className={`flex items-start gap-3 rounded-xl px-3.5 py-3 border transition ${
            n.read ? 'bg-white/5 border-white/5' : 'bg-white/10 border-white/10'
          }`}
        >
          <span className="text-lg leading-none mt-0.5">{ICONS[n.type] ?? '🔔'}</span>
          <div className="flex-1 min-w-0">
            <p className={`text-sm ${n.read ? 'text-neutral-400' : 'text-neutral-100 font-semibold'}`}>{n.title}</p>
            {n.body && <p className="text-xs text-neutral-500 mt-0.5">{n.body}</p>}
            <p className="text-[11px] text-neutral-600 mt-1">{timeAgo(n.createdAt)}</p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(n.id);
            }}
            className="text-neutral-600 px-1"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
