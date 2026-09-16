import { useState } from 'react';
import Leaderboard from './Leaderboard';
import { readEquippedAccessories } from '../../data/storeItems';
import { resolveMascotId } from '../../data/mascots';
import { useFriendSuggestions } from '../../hooks/useFriendSuggestions';
import SocialFeed from './SocialFeed';
import JimmyWelcomeBanner from './JimmyWelcomeBanner';
import NotificationsModal from './NotificationsModal';
import FriendManagementModal from './FriendManagementModal';

// The Social tab, rebuilt around one question at a time.
//
// It used to stack five things vertically — inbox, notifications,
// leaderboard, suggestions, friend management, and only then the feed —
// so the thing people actually come here for was a screen and a half
// down, under four blocks that are mostly idle. Now:
//
//   * the two blocks that are only interesting when something HAPPENED
//     (notifications, friend requests) live behind header icons that
//     carry a dot when they have something to say;
//   * the two that are the point — the feed and the board — are one tap
//     apart instead of stacked, so neither pushes the other off screen.
//
// The icons sit in this page's own header rather than the global TopHud
// beside the coin balance. A bell on the Store tab would be a second
// route to a thing BottomNav already badges, and TopHud is deliberately
// stateless chrome; threading four social callbacks through Layout to
// reach it would couple every screen to this one.

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  );
}

// A header action with an unread dot. The dot is a plain marker, not a
// count: the number is inside the sheet, and two badges side by side in a
// 40px header turn into noise you stop reading.
function HeaderAction({ label, badge, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-300 transition active:scale-90"
    >
      {children}
      {badge && (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--danger)] ring-2 ring-neutral-950"
        />
      )}
    </button>
  );
}

const TABS = [
  { id: 'feed', label: '🔥 Live Feed' },
  { id: 'leaderboard', label: '🏆 Leaderboard' },
];

// Twenty plus your own row if you missed the cut — see Leaderboard.
//
// Was five, which quietly capped the board at "you and four friends" long
// before anyone had twenty active friends to rank. Note the OTHER filter,
// which this number cannot lift: the board is built from feed posts in a
// rolling 7-day window (Leaderboard.tsx), so it shows up to twenty people
// who trained THIS WEEK, not the twenty biggest lifters of all time.
const BOARD_SIZE = 20;

export default function SocialPage({
  account,
  workouts,
  feedPosts,
  feedLoading,
  feedError,
  myUid,
  myFriendCode,
  friendUids,
  // Who Jimmy is, straight from the welcome callable — see
  // JimmyWelcomeBanner. null until it answers, and on any launch where it
  // failed, which just means the banner does not draw.
  officialFriendUid = null,
  friends,
  incomingRequests,
  onSendRequest,
  onSendRequestByUid,
  onRespond,
  notifications,
  onMarkNotificationRead,
  onDismissNotification,
  inboxItems = [],
  onAcceptInboxItem,
  onDeclineInboxItem,
}) {
  const [activeTab, setActiveTab] = useState('feed');
  const [sheet, setSheet] = useState(null); // 'notifications' | 'friends' | null

  const unreadCount = notifications.filter((n) => !n.read).length;
  // The bell speaks for both surfaces behind it: an unanswered workout
  // recommendation is exactly the kind of thing that must not sit unseen
  // because its own arrival notification happened to be read already.
  const bellHasSomething = unreadCount > 0 || inboxItems.length > 0;

  // Keyed on the friend COUNT, not the array: accepting a request or
  // adding someone is what makes the previous suggestion list wrong, and
  // the array itself is a new object on every Firestore snapshot.
  const { suggestions, loading: suggestionsLoading } = useFriendSuggestions({
    enabled: Boolean(myUid),
    friendCount: friendUids.length,
  });

  return (
    <div className="flex flex-col gap-5 pt-6 pb-nav">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-neutral-50">Social</h1>
        <div className="flex items-center gap-2">
          <HeaderAction label="Notifications" badge={bellHasSomething} onClick={() => setSheet('notifications')}>
            <BellIcon />
          </HeaderAction>
          <HeaderAction
            label="Friends and requests"
            badge={incomingRequests.length > 0}
            onClick={() => setSheet('friends')}
          >
            <UserPlusIcon />
          </HeaderAction>
        </div>
      </header>

      {/* Above the segmented control, not inside the feed branch: the
          message is about the account, and one tap on Leaderboard would
          otherwise make it disappear mid-read. Renders nothing at all
          once dismissed, or for anyone not actually friends with Jimmy. */}
      <JimmyWelcomeBanner
        myUid={myUid}
        friendUids={friendUids}
        officialFriendUid={officialFriendUid}
      />

      {/* Segmented control rather than two more stacked sections: these
          are two answers to "what are my friends up to", and only one of
          them is worth screen space at a time. */}
      <div className="flex gap-1 rounded-2xl border border-white/10 bg-zinc-900 p-1">
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={active}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
                active ? 'bg-zinc-700 text-neutral-50 shadow' : 'text-neutral-400'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'leaderboard' ? (
        <Leaderboard
          workouts={workouts}
          feedPosts={feedPosts}
          equippedAccessories={readEquippedAccessories(account)}
          currentStreak={Number(account?.currentStreak) || 0}
          minStage={account?.role === 'trainer' ? 2 : 1}
          // Your row alone — every other row reads its mascot off the feed
          // post that produced it.
          mascot={resolveMascotId(account)}
          limit={BOARD_SIZE}
        />
      ) : (
        <SocialFeed
          posts={feedPosts}
          loading={feedLoading}
          error={feedError}
          hasFriends={friendUids.length > 0}
          myUid={myUid}
        />
      )}

      {sheet === 'notifications' && (
        <NotificationsModal
          inboxItems={inboxItems}
          onAcceptInboxItem={onAcceptInboxItem}
          onDeclineInboxItem={onDeclineInboxItem}
          notifications={notifications}
          onMarkNotificationRead={onMarkNotificationRead}
          onDismissNotification={onDismissNotification}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet === 'friends' && (
        <FriendManagementModal
          myFriendCode={myFriendCode}
          friends={friends}
          incomingRequests={incomingRequests}
          onSendRequest={onSendRequest}
          onSendRequestByUid={onSendRequestByUid}
          onRespond={onRespond}
          suggestions={suggestions}
          suggestionsLoading={suggestionsLoading}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
