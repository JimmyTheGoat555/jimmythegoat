import { NavLink, useLocation } from 'react-router-dom';
import { TAB_PATHS, TRAINER_TAB_PATH } from './tabPaths';

function WorkoutIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--tier-accent)' : '#8e8e93'} strokeWidth="2" strokeLinecap="round">
      <path d="M6.5 6.5v11M17.5 6.5v11M2 9.5v5M22 9.5v5M6.5 12h11" />
    </svg>
  );
}

function ProgressIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--tier-accent)' : '#8e8e93'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 6h6v6" />
    </svg>
  );
}

function SocialIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--tier-accent)' : '#8e8e93'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" />
      <circle cx="17.5" cy="9" r="2.3" />
      <path d="M15.5 15.2c2.6.4 4.5 2.1 4.5 4.8" />
    </svg>
  );
}

// A shopping bag — the coin economy's storefront (see GymShop.jsx).
function ShopIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--tier-accent)' : '#8e8e93'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8h12l-1 12.5a1.5 1.5 0 0 1-1.5 1.5h-7a1.5 1.5 0 0 1-1.5-1.5L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

// A clipboard-with-check: distinct from Social's people icon, reads as
// "the plans/roster I manage" for a trainer.
function TraineesIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--tier-accent)' : '#8e8e93'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 12.5l2 2 4-4.5" />
    </svg>
  );
}

// `to` values come from tabPaths.js (imported above) rather than being
// typed here again — see that file for why it's split out, and why
// App.jsx's Layout needs the same list for the swipe gesture hook and its
// direction-aware enter animation (hooks/useTabSwipe.js).
const BASE_TABS = [
  { to: TAB_PATHS[0], label: 'Workout', Icon: WorkoutIcon, end: true },
  { to: TAB_PATHS[1], label: 'Progress', Icon: ProgressIcon },
  { to: TAB_PATHS[2], label: 'Social', Icon: SocialIcon },
  // Everyone gets the Store now — the coin economy applies to trainers and
  // trainees alike (see App.jsx), so this isn't trainer/trainee-gated the
  // way Trainees below is. Used to be a button on ProfileView; a dedicated
  // tab replaced that entry point entirely, not just added a second one.
  { to: TAB_PATHS[3], label: 'Store', Icon: ShopIcon },
];

const TRAINER_TAB = { to: TRAINER_TAB_PATH, label: 'Trainees', Icon: TraineesIcon };

const GRID_COLS = { 4: 'grid-cols-4', 5: 'grid-cols-5' };

function tabsFor(isTrainer) {
  return isTrainer ? [...BASE_TABS, TRAINER_TAB] : BASE_TABS;
}

// `tierId` only matters for the CSS var it relies on already being set on
// an ancestor (App.jsx sets --tier-accent there) — nothing to compute here.
// `unreadNotifications` drives the red badge on the Social tab: the
// notification inbox lives on that tab (see SocialPage.jsx), so this is
// the one place a queued nudge or weigh-in reminder announces itself
// before you open it.
export default function BottomNav({ isTrainer, unreadNotifications = 0 }) {
  const location = useLocation();
  const tabs = tabsFor(isTrainer);
  // Exact-match only (not "which tab is this a sub-page of") — a tab
  // button click only ever targets one of these exact paths, so this is
  // just "which of THESE am I on right now", never -1 in practice for a
  // click made from a screen this nav bar is even rendered on.
  const currentIndex = tabs.findIndex((t) => t.to === location.pathname);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-neutral-950/92 border-t border-white/10">
      <div className={`max-w-md mx-auto grid ${GRID_COLS[tabs.length]}`}>
        {tabs.map(({ to, label, Icon, end }, index) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            // Tapping a tab gets the same directional slide-in swiping to
            // it would have — see App.jsx's Layout and index.css's
            // .tab-enter-* keyframes. `undefined` (not e.g. 'none') when
            // already on this tab, matching what useTabSwipe leaves
            // unset for a same-tab no-op.
            state={
              currentIndex === -1 || index === currentIndex
                ? undefined
                : { navDirection: index > currentIndex ? 'forward' : 'backward' }
            }
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-1 py-3 text-xs font-medium transition-transform active:scale-90 ${
                isActive ? '' : 'text-neutral-500'
              }`
            }
            style={({ isActive }) => (isActive ? { color: 'var(--tier-accent)' } : undefined)}
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <Icon active={isActive} />
                  {to === TAB_PATHS[2] && unreadNotifications > 0 && (
                    <span
                      className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-[var(--danger)] text-white text-[10px] font-bold leading-none tabular-nums"
                      aria-label={`${unreadNotifications} unread notifications`}
                    >
                      {unreadNotifications > 9 ? '9+' : unreadNotifications}
                    </span>
                  )}
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
