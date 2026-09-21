import { useModerationActions } from '../../context/Moderation';

// The ⋯ beside another person's name. Opens the one shared Block/Report
// sheet (components/social/UserActionsSheet.jsx, rendered by
// ModerationProvider); this component is only the button, because on most
// of these surfaces blocking removes the very row the ⋯ sits in, and a
// sheet owned by that row unmounts with it mid-confirmation.
//
// This is the App Store Guideline 1.2 control, so the rules it follows are
// review rules as much as design ones —
//
//   * it is a VISIBLE button, not a long-press. A gesture a reviewer
//     cannot see is a gesture they will report as missing;
//   * it sits next to the name on every surface that shows one — the feed,
//     the friends list, the friend requests, the leaderboard, the inbox,
//     and the profile page every one of those links to;
//   * blocking takes effect immediately and with no server round trip
//     (hooks/useModeration.js), so the account is gone from the screen
//     before the sheet has finished closing.
//
// It renders NOTHING for your own uid. Your own name appears on the
// leaderboard ("You") and on your own posts, and a Block button next to it
// is both useless and alarming.

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <circle cx="5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="19" cy="12" r="1.9" />
    </svg>
  );
}

export default function UserActionsMenu({
  targetUid,
  targetName = 'this account',
  myUid,
  // Which screen the ⋯ was tapped on — stored on the report. See
  // hooks/useModeration.js for why it is worth a field.
  surface = '',
  // Lets a caller position it — the leaderboard needs it absolutely
  // placed over a row that is one big <Link>.
  className = '',
  label,
}) {
  const { openUserActions } = useModerationActions();

  // Your own row never gets one, and neither does a card whose author we
  // could not resolve (an old feed post missing userId, say) — a ⋯ that
  // opens a sheet about nobody is worse than no ⋯.
  if (!targetUid || targetUid === myUid) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        // Every one of these sits inside or on top of something tappable:
        // a feed card, a friends-list row, a whole leaderboard row that is
        // a <Link>. Without this, opening the menu also navigates to the
        // profile behind it.
        e.preventDefault();
        e.stopPropagation();
        openUserActions({ targetUid, targetName, surface });
      }}
      aria-label={label ?? `More options for ${targetName}`}
      aria-haspopup="dialog"
      className={`shrink-0 rounded-full p-1.5 text-neutral-500 transition active:scale-90 ${className}`}
    >
      <DotsIcon />
    </button>
  );
}
