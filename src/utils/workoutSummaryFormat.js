// Formatting for the end-of-workout summary, kept out of the components
// so the same strings can be laid onto a canvas later (the story sticker)
// without importing React.

// "1h 15m", "47m", "2h", "0:42". Each unit only appears when it has a
// value: "0h 47m" and "1h 0m" both read like a placeholder somebody forgot
// to fill in. A sub-minute session falls back to m:ss rather than
// rounding down to a proud "0m".
export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(Number(ms) || 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 1) return `0:${String(Math.floor(totalSeconds % 60)).padStart(2, '0')}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

// The headline clock, split into the big figure and its small unit so the
// two can be set in different sizes: { value: '47', unit: 'MIN' },
// { value: '1:15', unit: 'HRS' }, { value: '0:42', unit: 'MIN' }. Used
// while a count-up is in flight too, so it has to look right at every
// intermediate value — which is why an hour-plus session shows h:mm
// throughout rather than flipping format as the count crosses 60.
export function formatClockParts(ms, { hours: forceHours = false } = {}) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  if (forceHours || minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return { value: `${h}:${String(m).padStart(2, '0')}`, unit: 'HRS' };
  }
  if (minutes < 1) {
    return {
      value: `0:${String(totalSeconds % 60).padStart(2, '0')}`,
      unit: 'MIN',
    };
  }
  return { value: String(minutes), unit: 'MIN' };
}

export function formatVolume(kg) {
  return Math.max(0, Math.round(Number(kg) || 0)).toLocaleString('en-US');
}

// A set line: "10 × 80 kg", or "10 × bodyweight" for a set with no belt.
export function formatSet(set) {
  const reps = Number(set?.reps) || 0;
  const weight = Number(set?.weight) || 0;
  if (set?.isBodyweight === true) {
    const added = Number(set?.addedWeight) || 0;
    return added > 0 ? `${reps} × BW +${added} kg` : `${reps} × bodyweight`;
  }
  return weight > 0 ? `${reps} × ${weight} kg` : `${reps} reps`;
}

// The chip form of a set — "10×80", "10×BW", "8×BW+10" — for a row that
// has to fit a whole exercise on one line.
export function formatSetChip(set) {
  const reps = Number(set?.reps) || 0;
  const weight = Number(set?.weight) || 0;
  if (set?.isBodyweight === true) {
    const added = Number(set?.addedWeight) || 0;
    return added > 0 ? `${reps}×BW+${added}` : `${reps}×BW`;
  }
  return weight > 0 ? `${reps}×${weight}` : `${reps}`;
}

// "3 sets · 80 kg" / "3 sets · BW" / "3 sets" — the one-line digest for
// a session with too many exercises to show every set.
export function formatSetsDigest(sets) {
  const list = Array.isArray(sets) ? sets : [];
  const count = `${list.length} set${list.length === 1 ? '' : 's'}`;
  if (list.length === 0) return count;
  const bodyweight = list.every((s) => s?.isBodyweight === true);
  if (bodyweight) return `${count} · BW`;
  const top = Math.max(...list.map((s) => Number(s?.weight) || 0));
  return top > 0 ? `${count} · ${top} kg` : count;
}

// "TUE · SEP 16"
export function formatSummaryDate(timestamp) {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${weekday} · ${day}`.toUpperCase();
}
