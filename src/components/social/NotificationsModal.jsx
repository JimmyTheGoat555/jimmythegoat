import SocialSheet from './SocialSheet';
import WorkoutInbox from './WorkoutInbox';
import NotificationsList from './NotificationsList';

// Everything that arrived while you were away, behind the bell.
//
// These two used to lead the Social page, which meant every visit began
// with a wall of things that had already been read — you scrolled past
// your own inbox to reach the feed, every single time. Behind an icon
// with a dot on it they cost nothing on the visits where nothing has
// happened, which is most of them.
//
// The inbox goes first: it is the only part of this sheet that is waiting
// on a decision rather than telling you something.
export default function NotificationsModal({
  // Passed through to the inbox rows' ⋯ menu — see WorkoutInbox.
  myUid,
  inboxItems,
  onAcceptInboxItem,
  onDeclineInboxItem,
  notifications,
  onMarkNotificationRead,
  onDismissNotification,
  onClose,
}) {
  const unreadCount = notifications.filter((n) => !n.read).length;
  const nothingAtAll = inboxItems.length === 0 && notifications.length === 0;

  return (
    <SocialSheet
      title="Notifications"
      subtitle={
        nothingAtAll
          ? 'Nothing new right now.'
          : unreadCount > 0
            ? `${unreadCount} unread`
            : 'All caught up.'
      }
      onClose={onClose}
    >
      <WorkoutInbox myUid={myUid} items={inboxItems} onAccept={onAcceptInboxItem} onDecline={onDeclineInboxItem} />
      <NotificationsList
        notifications={notifications}
        onMarkRead={onMarkNotificationRead}
        onDismiss={onDismissNotification}
      />
    </SocialSheet>
  );
}
