// The choreography of the end-of-workout card, as absolute milliseconds.
//
// Kept apart from the component (AnimatedWorkoutSummary.jsx) so the story
// sticker exporter can ask how long the film runs — and where each beat
// lands — without rendering anything. Read top to bottom, this is the
// sequence: the card and header settle, the two headline numbers race up
// together, then the list is crossed off row by row, then the footer
// stamps it.

// The card's fixed frame, in design pixels: 9:16, the story format. The
// phone scales the whole card to fit; the recorder draws it at 3× for
// 1080×1920. Same layout both times, to the pixel.
export const SUMMARY_WIDTH = 360;
export const SUMMARY_HEIGHT = 640;

export const INTRO_MS = 420;
export const STATS_AT = 260;
export const STATS_MS = 1250;
export const LIST_AT = STATS_AT + STATS_MS + 120;
// Per-row spacing shrinks with the row count so a nine-exercise session
// does not take twice as long to replay as a four-exercise one; the floor
// keeps consecutive strikes readable as separate beats.
const ROW_STAGGER_MAX_MS = 460;
const ROW_STAGGER_MIN_MS = 250;
const LIST_BUDGET_MS = 2700;
export const ROW_REVEAL_MS = 280;
// The strike starts a beat after the row lands, so you read the name
// before it is crossed off.
export const STRIKE_DELAY_MS = 170;
export const STRIKE_MS = 420;
export const OUTRO_MS = 560;
const HOLD_MS = 300;
// More rows than this and the tail is folded into one "+N more" row: the
// card is a fixed height, and a row you cannot read is not a row.
export const MAX_ROWS = 8;
// Past this many exercises the set chips give way to a one-line digest.
export const ROOMY_ROW_LIMIT = 5;

// Where every beat of a given workout lands, so the card and the
// exporter agree on the length of the film.
export function buildSummaryTimeline(exercises) {
  const list = Array.isArray(exercises) ? exercises : [];
  const shown = list.length > MAX_ROWS ? MAX_ROWS : list.length;
  const stagger = shown === 0 ? 0 : Math.min(ROW_STAGGER_MAX_MS, Math.max(ROW_STAGGER_MIN_MS, LIST_BUDGET_MS / shown));
  const rows = [];
  for (let i = 0; i < shown; i += 1) {
    const at = LIST_AT + i * stagger;
    rows.push({ at, strikeAt: at + STRIKE_DELAY_MS });
  }
  const listEnd = shown === 0 ? LIST_AT : rows[shown - 1].strikeAt + STRIKE_MS;
  const outroAt = listEnd + 140;
  const endAt = outroAt + OUTRO_MS + HOLD_MS;
  return {
    rows,
    stagger,
    outroAt,
    endAt,
    compact: list.length > ROOMY_ROW_LIMIT,
  };
}

// The rows actually drawn: every exercise when they fit, otherwise the
// first MAX_ROWS − 1 and one row that stands in for the rest.
export function buildRows(exercises, personalRecords, maxRows = MAX_ROWS) {
  const list = Array.isArray(exercises) ? exercises : [];
  const prByName = new Map((personalRecords ?? []).map((r) => [r.name, r]));
  const rows = list.map((exercise) => ({
    name: exercise?.name ?? '',
    sets: Array.isArray(exercise?.sets) ? exercise.sets : [],
    pr: prByName.get(exercise?.name) ?? null,
    overflow: false,
  }));
  if (rows.length <= maxRows) return rows;
  const rest = rows.slice(maxRows - 1);
  const restSets = rest.reduce((n, r) => n + r.sets.length, 0);
  return [
    ...rows.slice(0, maxRows - 1),
    {
      name: `+${rest.length} more exercise${rest.length === 1 ? '' : 's'}`,
      sets: [],
      digest: `${restSets} set${restSets === 1 ? '' : 's'}`,
      pr: null,
      overflow: true,
    },
  ];
}
