import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import UserActionsSheet from '../components/social/UserActionsSheet';

// Block/report, published once for every surface that draws somebody
// else's name — the feed, the leaderboard, the friends list, the friend
// requests, the inbox and the public profile.
//
// A context rather than props, and the reason is the shape of the tree
// rather than a preference: the ⋯ menu's deepest call site is five
// components below App (App → SocialPage → NotificationsModal →
// WorkoutInbox → the row), and none of the four in between has any
// business knowing what blocking is. Threading three callbacks through
// them would mean the next surface that shows a name has to thread them
// again, which is exactly how a review-mandated control ends up missing
// from the one screen somebody forgot.
//
// The opposite of JimmyLookContext's scoping note, deliberately: that one
// is about YOU and must never be read where somebody else is drawn. This
// one is about everybody else and is only ever read there.
//
// The provider also OWNS THE SHEET, for a reason found by using it:
// blocking somebody from a list removes their row on the next render, and
// a sheet rendered by that row unmounts with it — the block landed, but
// the confirmation disappeared, and "Report sent" was unreadable. One
// sheet up here outlives every row it can be opened from.
//
// `value` is hooks/useModeration.js's return, memoized there — App
// re-renders once a second while a rest timer runs, and every ⋯ on screen
// subscribes to this.

// Outside a provider — the dev harnesses in dev/, and any future screen
// that renders a name before sign-in resolves. Blocking nobody and
// throwing on a write is the honest default: a no-op block would look like
// it worked. `openUserActions` is the one exception, a real no-op, because
// there is no sheet mounted for it to open.
const UNAVAILABLE = {
  blockedUids: [],
  blockUser: () => Promise.reject(new Error('Not signed in.')),
  unblockUser: () => Promise.reject(new Error('Not signed in.')),
  reportUser: () => Promise.reject(new Error('Not signed in.')),
  openUserActions: () => {},
};

const ModerationContext = createContext(UNAVAILABLE);

export function ModerationProvider({ value, children }) {
  const actions = value ?? UNAVAILABLE;
  // `target` outlives `open` on purpose: BottomSheet animates itself out
  // over ~320ms, and clearing the target on close would blank the sheet's
  // title and body for the whole slide down.
  const [target, setTarget] = useState(null);
  const [open, setOpen] = useState(false);

  const openUserActions = useCallback((next) => {
    setTarget(next);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  const published = useMemo(() => ({ ...actions, openUserActions }), [actions, openUserActions]);

  return (
    <ModerationContext.Provider value={published}>
      {children}
      <UserActionsSheet open={open} target={target} actions={actions} onClose={close} />
    </ModerationContext.Provider>
  );
}

export function useModerationActions() {
  return useContext(ModerationContext);
}
