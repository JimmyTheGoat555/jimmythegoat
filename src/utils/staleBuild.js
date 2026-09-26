// Is this the app running old page code against a new build's assets?
//
// The app has a documented history of going blank on iPhone when a tab left
// open across a deploy fetches a lazily imported screen whose hashed chunk
// the new build no longer has (see main.jsx and vite.config.js). The wording
// differs per browser, and Vite's CSS preload failure is the same stale-build
// class as a missing JS chunk — all verified against the real strings Chrome,
// Firefox, Safari and Vite actually throw.
//
// Two callers share this one matcher on purpose: ErrorBoundary reloads once
// on a match, and main.jsx's Sentry `beforeSend` drops the ones that reload
// already fixed. They have to agree about what counts, or the dashboard fills
// up with the one error nobody needs to see.
const STALE_BUILD_RE =
  /loading chunk|dynamically imported module|importing a module script failed|failed to fetch dynamically|unable to preload/i;

export function isStaleBuildError(error) {
  return STALE_BUILD_RE.test(`${error?.name ?? ''} ${error?.message ?? ''}`);
}
