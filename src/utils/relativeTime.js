// "3h ago" for an ISO timestamp — the feed's tense. Shared so a friend's
// profile and their feed card cannot disagree about when the same workout
// happened. Unparseable input renders as nothing rather than "NaNd ago".
export function relativeTime(iso) {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return '';
  const diffMs = Math.max(0, Date.now() - at);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
