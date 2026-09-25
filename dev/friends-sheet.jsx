import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../src/index.css';
import FriendManagementModal from '../src/components/social/FriendManagementModal';
import { ModerationProvider } from '../src/context/Moderation';
import { JimmyLookProvider } from '../src/context/JimmyLook';
import { tierCssVars } from '../src/utils/tierTheme';

// The Friends sheet, with enough friends to make it scroll vertically and
// enough suggestions to make "People you might know" scroll horizontally —
// which is the only way to see the thing this page exists for.
//
// The bug: the suggestions row sits at the BOTTOM of a sheet that scrolls
// the other way. With no declared touch-action the browser waits to see
// which way a touch drifts before committing an axis, and a swipe across a
// row of cards is never perfectly horizontal, so the sheet wins and the
// row sits still. `touch-pan-x` commits at the first pixel;
// `overscroll-x-contain` stops a flick past the last card chaining out.
//
// Behind a long page on purpose: scroll chaining is only visible when
// there is something behind the sheet for a flick to leak into.
//
// Dev only — this page is never built.

const ME = 'u_me';
const name = (i) => ['Dana', 'Omer', 'Yael', 'Noa', 'Itai', 'Maya', 'Roni', 'Gal', 'Tal', 'Shir'][i % 10];

const FRIENDS = Array.from({ length: 12 }, (_, i) => ({
  uid: `u_f${i}`,
  displayName: `${name(i)} ${i + 1}`,
  lifetimeVolume: 40_000 + i * 9_000,
}));

const SUGGESTIONS = Array.from({ length: 10 }, (_, i) => ({
  uid: `u_s${i}`,
  displayName: `${name(i + 3)} ${i + 1}`,
  lifetimeVolume: 15_000 + i * 21_000,
  mutualCount: (i % 4) + 1,
  mutualNames: [name(i), name(i + 1)],
}));

const moderation = {
  blockedUids: [],
  blockUser: async () => {},
  unblockUser: async () => {},
  reportUser: async () => {},
};

function Harness() {
  return (
    <ModerationProvider value={moderation}>
      <JimmyLookProvider evolutionStage={3} account={{}}>
        <div style={tierCssVars('titan')}>
          {/* The page underneath. If a flick inside the sheet moves THIS,
              scroll chaining is still getting out. */}
          <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-8">
            <h1 className="text-2xl font-bold text-neutral-50">Page behind the sheet</h1>
            {Array.from({ length: 30 }, (_, i) => (
              <p key={i} className="rounded-xl bg-neutral-900 p-4 text-sm text-neutral-500">
                Row {i + 1} — if this moves while you are swiping the card row, the fix is not working.
              </p>
            ))}
          </div>

          <FriendManagementModal
            myFriendCode="JIMMY-1234"
            myUid={ME}
            friends={FRIENDS}
            incomingRequests={[]}
            onSendRequest={async () => {}}
            onSendRequestByUid={async () => {}}
            onRespond={async () => {}}
            suggestions={SUGGESTIONS}
            suggestionsLoading={false}
            onClose={() => {}}
          />
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
