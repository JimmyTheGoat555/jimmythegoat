// Plain path list for the primary tab-bar routes, in the SAME order
// BottomNav.jsx's BASE_TABS/TRAINER_TAB renders them (it imports these
// same constants to build its own `to` values, rather than hand-typing
// the paths a second time — only the tab COUNT/order has to be kept in
// sync by hand if a tab is ever added, removed, or reordered there).
//
// Lives in its own file, separate from BottomNav.jsx itself, purely so
// this stays plain data: a component file that also exports a function
// or constant breaks Vite Fast Refresh for everything in it (this
// project's oxlint config flags exactly that), which is dev-only but
// avoidable enough to be worth the extra file. App.jsx's Layout needs
// this exact list for the swipe gesture hook and its direction-aware
// enter animation — see hooks/useTabSwipe.js.
export const TAB_PATHS = ['/', '/progress', '/social', '/shop'];
export const TRAINER_TAB_PATH = '/trainees';
