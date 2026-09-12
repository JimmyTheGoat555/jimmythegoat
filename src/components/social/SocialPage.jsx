import Leaderboard from './Leaderboard';
import { readEquippedAccessories } from '../../data/storeItems';
import FriendsManager from './FriendsManager';
import SocialFeed from './SocialFeed';
import NotificationsList from './NotificationsList';

// Composes the pieces the old Leaderboard.tsx used to do alone (ranking +
// friend management + the feed) plus the notification inbox, which used to
// be buried on ProfileView with no tab or badge pointing at it — a nudge
// or weigh-in reminder was effectively invisible. It leads the page now,
// above the leaderboard, so a fresh unread item is the first thing seen
// when the Social tab's badge (BottomNav) draws someone here. Each piece
// stays its own file since each is independently substantial (mutual
// friend requests, a live feed with per-post cheering).
export default function SocialPage({
  account,
  emailVerified,
  email,
  onResendVerification,
  onRecheckVerification,
  workouts,
  feedPosts,
  feedLoading,
  feedError,
  myUid,
  myFriendCode,
  friendUids,
  friends,
  incomingRequests,
  onSendRequest,
  onRespond,
  onRemove,
  notifications,
  onMarkNotificationRead,
  onDismissNotification,
}) {
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex flex-col gap-6 pt-6 pb-24">
      <h1 className="text-3xl font-bold text-neutral-50">Social</h1>

      <section className="card p-5 flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-neutral-100">
          Notifications
          {unreadCount > 0 && (
            <span className="ml-1.5 text-sm" style={{ color: 'var(--tier-accent)' }}>
              ({unreadCount})
            </span>
          )}
        </h2>
        <NotificationsList
          notifications={notifications}
          onMarkRead={onMarkNotificationRead}
          onDismiss={onDismissNotification}
        />
      </section>

      <Leaderboard workouts={workouts} feedPosts={feedPosts} equippedAccessories={readEquippedAccessories(account)} />

      <FriendsManager
        myFriendCode={myFriendCode}
        friends={friends}
        incomingRequests={incomingRequests}
        onSendRequest={onSendRequest}
        onRespond={onRespond}
        onRemove={onRemove}
        emailVerified={emailVerified}
        email={email}
        onResendVerification={onResendVerification}
        onRecheckVerification={onRecheckVerification}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Feed</h2>
        <SocialFeed
          posts={feedPosts}
          loading={feedLoading}
          error={feedError}
          hasFriends={friendUids.length > 0}
          myUid={myUid}
        />
      </section>
    </div>
  );
}
