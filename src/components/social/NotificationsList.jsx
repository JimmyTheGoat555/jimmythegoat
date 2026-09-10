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
    <ul className="flex flex-col gap-1.5">
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
