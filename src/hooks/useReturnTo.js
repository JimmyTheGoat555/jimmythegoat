import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Where a detail screen's "← Back" goes: the screen that linked here
// (`state.from`, set on the Link), or `fallback` when nothing did.
//
// Deliberately NOT navigate(-1). history.back() assumes the previous
// session-history entry is a live entry of THIS document, and in the
// installed app it often is not: iOS relaunches a suspended PWA at its
// last URL as a fresh load, and the auto-update in main.jsx reloads the
// page in place the moment a new build ships. After either, the entries
// before the current one belong to a document that no longer exists, so
// going back is a full page load of that URL — the whole app booting
// again behind a white screen and, with no signal, nothing at all. That
// was the "blank page after closing a workout" report. An explicit route
// change never leaves the document: the Layout stays mounted and the
// target screen renders in the same frame.
//
// `replace`, so a detail page does not stack a second copy of its parent
// on the history: [Progress, Workout] becomes [Progress, Progress] rather
// than [Progress, Workout, Progress], and the system back gesture from
// there goes on to the previous tab instead of reopening the workout.
export function useReturnTo(fallback) {
  const navigate = useNavigate();
  const { state } = useLocation();
  // Only an absolute in-app path is honoured, whatever ends up in state.
  const from = typeof state?.from === 'string' && /^\/[^/]/.test(state.from) ? state.from : fallback;
  return useCallback(() => navigate(from, { replace: true }), [navigate, from]);
}
