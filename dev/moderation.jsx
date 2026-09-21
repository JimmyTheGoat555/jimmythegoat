import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../src/index.css';
import SocialFeed from '../src/components/social/SocialFeed';
import Leaderboard from '../src/components/social/Leaderboard';
import FriendsManager from '../src/components/social/FriendsManager';
import WorkoutInbox from '../src/components/social/WorkoutInbox';
import { FriendProfileScreen } from '../src/components/social/PublicFriendProfile';
import BlockedAccountsSection from '../src/components/profile/BlockedAccountsSection';
import { ModerationProvider } from '../src/context/Moderation';
import { JimmyLookProvider } from '../src/context/JimmyLook';
import { withoutBlocked, withoutBlockedUids } from '../src/utils/moderation';
import { tierCssVars } from '../src/utils/tierTheme';

// Every surface that carries the ⋯ menu, on one page, with a real block
// list held in memory instead of Firestore. The point is the FILTERING:
// block someone here and watch them leave the feed, the board, the friends
// list and the inbox at once, which is the behaviour App.jsx wires up and
// the thing a screenshot of any single component cannot show.
//
// Blocking and unblocking mutate local state; reporting logs the document
// that would have been written, so the payload can be read without the
// collection being readable (it is write-only — see firestore.rules).
//
//   ?blocked=u_dana   start with somebody already blocked
//
// Dev only — this page is never built.

const params = new URLSearchParams(location.search);
const ME = 'u_me';

const PEOPLE = [
  { uid: 'u_dana', displayName: 'Dana' },
  { uid: 'u_omer', displayName: 'Omer' },
  { uid: 'u_yael', displayName: 'Yael' },
];

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();

const POSTS = [
  { id: 'p1', userId: 'u_dana', userName: 'Dana', headline: 'Push day', totalSets: 18, totalVolume: 9200, score: 120, timestamp: hoursAgo(2), lifetimeVolume: 240_000 },
  { id: 'p2', userId: 'u_omer', userName: 'Omer', headline: 'Leg day', totalSets: 14, totalVolume: 4100, score: 62, timestamp: hoursAgo(9), lifetimeVolume: 60_000 },
  { id: 'p3', userId: 'u_yael', userName: 'Yael', headline: 'Pull day', totalSets: 12, totalVolume: 2600, score: 48, timestamp: hoursAgo(30), lifetimeVolume: 12_000 },
];

const REQUESTS = [{ id: 'u_stranger', fromUid: 'u_stranger', fromName: 'xX_troll_Xx', createdAt: hoursAgo(1) }];

const INBOX = [
  {
    id: 'i1',
    type: 'workout_recommendation',
    senderUid: 'u_dana',
    senderName: 'Dana',
    message: 'this one wrecked me, try it',
    templateData: { title: 'Chest & Tris', exercises: [{ exerciseId: 'bench-press', name: 'Bench Press', muscleGroup: 'chest' }] },
    createdAt: hoursAgo(3),
  },
];

function Panel({ title, children }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      {children}
    </section>
  );
}

function Harness() {
  const [blockedUids, setBlockedUids] = useState(() => {
    const seed = params.get('blocked');
    return seed ? seed.split(',') : [];
  });
  const [log, setLog] = useState([]);

  // Stands in for hooks/useModeration.js. Same shape, same promises — the
  // sheet cannot tell the difference, which is the point of the context.
  const moderation = useMemo(
    () => ({
      blockedUids,
      blockUser: async (uid) => setBlockedUids((prev) => (prev.includes(uid) ? prev : [...prev, uid])),
      unblockUser: async (uid) => setBlockedUids((prev) => prev.filter((u) => u !== uid)),
      reportUser: async (uid, payload) =>
        setLog((prev) => [`reports/${ME}__${uid} ← ${JSON.stringify(payload)}`, ...prev]),
    }),
    [blockedUids],
  );

  // Exactly the filtering App.jsx does, against the same helpers.
  const visibleFriendUids = withoutBlockedUids(PEOPLE.map((p) => p.uid), blockedUids);
  const friends = PEOPLE.filter((p) => visibleFriendUids.includes(p.uid));
  const posts = withoutBlocked(POSTS, blockedUids, (p) => p.userId);
  const requests = withoutBlocked(REQUESTS, blockedUids, (r) => r.fromUid);
  const inbox = withoutBlocked(INBOX, blockedUids, (i) => i.senderUid);

  return (
    <ModerationProvider value={moderation}>
      <JimmyLookProvider evolutionStage={3} account={{}}>
        <div className="mx-auto flex max-w-md flex-col gap-7 px-4 py-8" style={tierCssVars('titan')}>
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold text-neutral-50">Block &amp; report</h1>
            <p className="text-sm text-neutral-500">
              Blocked: {blockedUids.length === 0 ? 'nobody' : blockedUids.join(', ')}
            </p>
          </header>

          <Panel title="Feed">
            <SocialFeed posts={posts} loading={false} error={null} hasFriends myUid={ME} />
          </Panel>

          <Panel title="Leaderboard">
            <Leaderboard workouts={[]} feedPosts={posts} friends={friends} friendSummaries={{}} myUid={ME} />
          </Panel>

          <Panel title="Friends & requests">
            <FriendsManager
              embedded
              myFriendCode="ABC123"
              myUid={ME}
              friends={friends}
              incomingRequests={requests}
              onSendRequest={async () => ({ targetName: 'nobody' })}
              onSendRequestByUid={async () => {}}
              onRespond={async () => {}}
            />
          </Panel>

          <Panel title="Inbox">
            <WorkoutInbox items={inbox} myUid={ME} onAccept={async () => {}} onDecline={async () => {}} />
          </Panel>

          <Panel title="Their profile (blocked state)">
            <FriendProfileScreen
              name="Dana"
              friendUid="u_dana"
              myUid={ME}
              blocked={blockedUids.includes('u_dana')}
              onBack={() => {}}
              onSendNudge={() => {}}
              onSaveTemplate={() => {}}
            />
          </Panel>

          <Panel title="Settings → Blocked accounts">
            {/* Names resolve through friendCodes, which needs a signed-in
                Firestore — so these rows fall back to "Blocked account"
                here. The unblock button is the part worth exercising. */}
            <BlockedAccountsSection />
          </Panel>

          <Panel title="Reports written">
            {log.length === 0 ? (
              <p className="text-xs text-neutral-600">Nothing reported yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {log.map((line, i) => (
                  <li key={i} className="break-all rounded-lg bg-white/5 px-2.5 py-2 text-[11px] text-neutral-400">
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </JimmyLookProvider>
    </ModerationProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MemoryRouter>
      <Harness />
    </MemoryRouter>
  </StrictMode>,
);
