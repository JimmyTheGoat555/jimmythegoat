import { mascotSpriteFor, resolveMascotId } from '../data/mascots';
import { drawSpaced, loadImage, releaseCanvas, spacedWidth, truncate } from './canvas';
import { clamp01, easeOutCubic, lerp } from './motion';
import { buildRows } from './workoutSummaryTimeline';
import { formatClockParts, formatSummaryDate, formatVolume } from './workoutSummaryFormat';

// The share sticker: the finished workout as a compact, TRANSPARENT PNG,
// in one of ten looks.
//
// ── WHAT THIS IS ────────────────────────────────────────────────────────
//
// Not the in-app celebration (components/workout/AnimatedWorkoutSummary
// .jsx, a dark 9:16 card with its own backdrop). This is the Strava-style
// sticker that gets pasted on top of the lifter's OWN photo in an
// Instagram story. It is a bounding box around its content, not a
// full-screen frame: a pasted
// sticker lands in the story at whatever size Instagram picks and the
// lifter pinches and drags it into place next to their face; a tight
// block does that gracefully, a 1080×1920 overlay with things pinned to
// its corners does not.
//
// ── THE SIX THEMES ──────────────────────────────────────────────────────
//
// All six are the same ink: white type with a soft black shadow so it
// reads on a bright gym wall as well as a dark one, and nothing behind
// it at all — every pixel that is not ink stays alpha 0. (A solid dark
// card was tried alongside them and cut; nothing here wants a
// background.)
//
//   classic  The original. The time, the sets and the volume up top,
//            the exercises with a dot per set, and the Titan mascot's
//            bust signing off at the bottom under the wordmark.
//   clean    Type only. The time huge in the app's display face, the
//            sets and the volume in a line beneath, the exercises set
//            in the same face, ruled like a page of a magazine.
//   mascot   The mascot large in the middle, the time on one side of
//            them and the sets on the other, the volume centred beneath,
//            the exercises in a centred column under that.
//
// And one that says less, on purpose — no exercise names, the volume
// leading, and the brand mark where the wordmark used to sign off:
//
//   pyramid  Three centred lines, each measured and forced narrower than
//            the one above — the verdict, the volume and the minutes,
//            the sets — and the brand unit as the apex: an inverted
//            triangle (▼) of tracked type and nothing else.
//
// (Two more of that kind — a monolith of one number, and a stamp of type
// around a circle — were cut; the pyramid is the one that earned its
// place.)
//
// And five brand looks, added as a set — "the brand looks", below:
//
//   receipt  A till receipt in monospace: dashed rules, dot leaders,
//            the exercises as line items, a barcode.
//   frame    A Polaroid: white paper, a window for the photo, the
//            session written on the wide bottom border in dark ink.
//   noir     The same Polaroid in negative: black paper, white ink.
//   split    A dark column down the left third, everything flush left
//            inside it; the photo has the rest.
//   grid     Swiss: a box ruled into cells, every figure in one.
//   pulse    A heartbeat across the width, spiking at each exercise,
//            with the volume huge over it.
//
// Under everything, on every theme, the brand: the goat mark from the
// logo (public/assets/logo.png, loaded before the first frame like the
// sprite) and the wordmark beside it, small, tracked and muted, drawn
// last so no theme can paint over it (drawWatermark). And every one of
// them is a story — 9:16, 1080 × 1920 — with the theme's block composed
// on it, so the PNG drops onto Instagram edge to edge.
//
// The volume on every one of them is the summary's figure (the server's
// own, or summaryFromWorkout's sum) — and failing that, weight × reps
// over every set here, added weight for a bodyweight set.
//
// Every theme lists every exercise by name, and only by name — no set
// counts, no loads, no reps. The figures at the top say how much; the
// list says what. Anything more read like a receipt.
//
// ── STILL AND MOVING ────────────────────────────────────────────────────
//
// prepareSticker lays a theme out once and hands back `draw(ctx, scale,
// reveal)`. With no `reveal` it paints the finished sticker — what the
// PNG is, and all the app asks for now. With one, each part of the
// sticker is painted at its own stage of arrival: the header fading in,
// the figures counting up, the rows landing one by one, the sign-off
// last. That served a recorded clip of the sticker, since cut; the
// stages stay because every theme is written in them and the finished
// sticker is simply all of them at 1.
//
// Same-origin only. The sprite comes from /assets on our own host, so
// drawing it does not taint the canvas.
//
// Drawn at 3× a 320-unit design width, so the PNG is 960 px wide — sharp
// when pinched up to fill a 1080-wide story — and its height is whatever
// the content needs.

export const STICKER_SCALE = 3;
// A story: 9:16 portrait, 1080 × 1920 at STICKER_SCALE. Every theme
// composes into this frame — its block centred inside the safe margins
// (SAFE), or the whole frame for a theme that fills it — so the PNG
// drops onto a story edge to edge, with no margins to fight.
export const STICKER_WIDTH = 360;
export const STICKER_HEIGHT = 640;

export const STICKER_THEMES = [
  { id: 'classic', name: 'Classic', blurb: 'The original — paste it over your own photo' },
  { id: 'clean', name: 'Clean', blurb: 'Just the type' },
  { id: 'mascot', name: 'Mascot', blurb: 'Your mascot, front and centre' },
  {
    id: 'pyramid',
    name: 'Pyramid',
    blurb: 'Three lines to a point, no names',
  },
  {
    id: 'receipt',
    name: 'Receipt',
    blurb: 'A till receipt in monospace — the session, itemised',
  },
  {
    id: 'frame',
    name: 'Frame',
    blurb: 'A Polaroid: your photo in the window, the session on the border',
  },
  {
    id: 'noir',
    name: 'Noir',
    blurb: 'The Frame in negative: black paper, white ink',
  },
  { id: 'split', name: 'Split', blurb: 'Everything flush left, your photo on the right' },
  { id: 'grid', name: 'Grid', blurb: 'Swiss rules — every figure in its own cell' },
  { id: 'pulse', name: 'Pulse', blurb: 'Your session as a heartbeat under the number' },
];
export const DEFAULT_STICKER_THEME = 'classic';

export function stickerTheme(id) {
  return STICKER_THEMES.find((theme) => theme.id === id) ?? STICKER_THEMES[0];
}

// Room around the content for the shadows to bleed into; a shadow clipped
// by the edge of the PNG is a visible seam on the photo.
const PAD = 20;
// The wordmark is the last thing on the sticker and sits as close to its
// bottom edge as its own shadow allows.
const BOTTOM_PAD = 7;
const CONTENT_W = STICKER_WIDTH - PAD * 2;
// What a story's own chrome covers at the top and the bottom (the
// account strip, the reply bar): a theme's block never sits under it.
const SAFE = { top: 72, bottom: 72 };

// One family, the platform's own: SF Pro on the iPhone this is mostly
// for, Roboto on Android, Segoe on Windows. All clean, all with a real
// heavy weight for the numbers.
const SANS =
  '-apple-system, "SF Pro Display", "SF Pro Text", system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
// The app's display face (index.css --font-arcade), for the typographic
// theme. One weight, no italic — which is the point of it.
const ARCADE = "Anton, 'Arial Narrow', sans-serif";
const ink = (a) => `rgba(255,255,255,${a})`;

// The shadows, in design units. Canvas shadows ignore the transform, so
// they are multiplied by the scale by hand where they are set.
const SHADOW = {
  text: { alpha: 0.7, blur: 4, dy: 1 },
  big: { alpha: 0.5, blur: 8, dy: 2 },
  art: { alpha: 0.45, blur: 12, dy: 4 },
};

// ── type scale ─────────────────────────────────────────────────────────
const EYEBROW = { px: 10, weight: 800, spacing: 2.2 };
const STAT_LABEL = { px: 10, weight: 800, spacing: 2.2 };
const STAT = { px: 44, min: 26, weight: 800 };
const UNIT = { px: 12, weight: 800, spacing: 1.5 };
const STAT_GAP = 22;
// One exercise per row: its name and nothing else — no set counts, no
// loads. The sticker says what was done; the figures above say how much.
const ROW = { name: 14, weight: 700, h: 22, gap: 4 };
// The bust: the top `fraction` of the Titan sprite at this height,
// fading out over the bottom `fade` of itself so there is no hard cut
// through the chest — the chest melts into the photo instead.
const BUST = {
  jimmy: { height: 122, fraction: 0.42, fade: 0.3 },
  gena: { height: 128, fraction: 0.4, fade: 0.3 },
};
// The hero: head and torso, the top `fraction` of the same sprite, as
// tall as `maxHeight` or as wide as `maxWidth` — whichever bites first —
// so the stat columns either side of it keep at least their minimum
// width on both mascots.
const HERO = { fraction: 0.62, fade: 0.22, maxHeight: 250, maxWidth: 144 };
// Which evolution stage's sprite the mascot is cut from: 3 is Titan.
const BUST_STAGE = 3;
// The brand, on every sticker, last: the goat mark and the wordmark as
// one unit — the mark `mark` tall, the wordmark's small caps-height type
// tracked out beside it — in muted ink, so it signs the sticker rather
// than advertising on it. Centred at the foot of the theme's block,
// `gap` below its last element; every layout leaves the band for it
// (prepareSticker). A theme may recolour or move it — never remove it.
const WATERMARK = {
  text: 'JIMMY THE GOAT',
  px: 13,
  weight: 700,
  spacing: 3,
  alpha: 0.66,
  gap: 10,
  mark: 20,
  markGap: 8,
};
// The brand mark — the goat from the logo — for the unit that signs
// every sticker (drawWatermark). White on transparent in the file, and
// tinted to its theme's ink when rasterised (makeTinted).
const LOGO = { src: '/assets/logo.png' };

// ── the typographic theme's scale ──
const BIG = { px: 104, min: 60 };
const BIG_UNIT = { px: 22, spacing: 1.5 };
const BIG_RULE = 3;
const TALLY = { px: 18, spacing: 1.5 };
const CLEAN_ROW = { name: 15, h: 26, top: 12, hairline: 0.32 };

// ── the hero theme's scale ──
const HERO_STAT = { px: 36, min: 22 };
const HERO_VOLUME = { px: 28 };

// ── reveal ─────────────────────────────────────────────────────────────
//
// How far along each part of the sticker is, 0..1. The finished sticker
// is every part at 1. `row(i)` rather than an array so a reveal can be
// built without knowing the row count.
export const FULL_REVEAL = Object.freeze({ intro: 1, header: 1, stats: 1, rule: 1, signoff: 1, row: () => 1 });

// Paints `paint` at stage `p` of its arrival: faded in and sliding up
// from `dy` below its place. Nothing is painted at 0.
function part(ctx, p, dy, paint) {
  if (p <= 0) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, p);
  if (p < 1) ctx.translate(0, lerp(dy, 0, p));
  paint();
  ctx.restore();
}

// ── helpers ────────────────────────────────────────────────────────────

function clearShadow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function setShadow(ctx, kind, scale) {
  const s = SHADOW[kind];
  ctx.shadowColor = `rgba(0,0,0,${s.alpha})`;
  ctx.shadowBlur = s.blur * scale;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = s.dy * scale;
}

function font(ctx, { px, weight = 400, family = SANS, style = '' }) {
  ctx.font = `${style ? `${style} ` : ''}${weight} ${px}px ${family}`;
}

// The largest size from `from` down to `min` (in steps of 2) at which
// `measure(px)` fits `maxWidth`.
function fitPx(measure, maxWidth, from, min) {
  let px = from;
  while (measure(px) > maxWidth && px > min) px -= 2;
  return px;
}

// The height of a capital in the current font, for setting a baseline
// so the cap sits exactly where the layout wants its top.
function capHeight(ctx) {
  const m = ctx.measureText('0');
  const asc = m.actualBoundingBoxAscent;
  return Number.isFinite(asc) && asc > 0 ? asc : (parseFloat(ctx.font) || 16) * 0.72;
}

// The headline figures at stage `count` of their count-up.
function clockAt(durationMs, count) {
  return formatClockParts(durationMs * count, { hours: durationMs >= 60 * 60 * 1000 });
}
function setsAt(setCount, count) {
  return String(Math.round(setCount * count));
}

// The session's volume: the summary's figure — the server's own, or
// summaryFromWorkout's sum — and, should that be missing, weight × reps
// over every set here, added weight standing in for a bodyweight set.
function totalVolume(summary, exercises) {
  const given = Number(summary?.totalVolumeKg);
  if (Number.isFinite(given) && given > 0) return given;
  return exercises.reduce(
    (sum, exercise) =>
      sum +
      (Array.isArray(exercise?.sets) ? exercise.sets : []).reduce((acc, set) => {
        const reps = Number(set?.reps) || 0;
        const load = set?.isBodyweight === true ? Number(set?.addedWeight) || 0 : Number(set?.weight) || 0;
        return acc + reps * load;
      }, 0),
    0,
  );
}

// The top of the sprite, faded out at the bottom, as its own canvas at
// device resolution — so the fade is applied to the art alone and the
// shadow that gets drawn under it follows the faded edge too.
function cropDims(sprite, { fraction }, height) {
  const srcW = sprite.naturalWidth || sprite.width;
  const srcH = (sprite.naturalHeight || sprite.height) * fraction;
  return { width: height * (srcW / srcH), height };
}

function makeCrop(sprite, { fraction, fade }, { width, height }, scale) {
  const srcW = sprite.naturalWidth || sprite.width;
  const srcH = (sprite.naturalHeight || sprite.height) * fraction;
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.round(width * scale));
  off.height = Math.max(1, Math.round(height * scale));
  const o = off.getContext('2d');
  o.drawImage(sprite, 0, 0, srcW, srcH, 0, 0, off.width, off.height);
  o.globalCompositeOperation = 'destination-out';
  const fadeTop = off.height * (1 - fade);
  const g = o.createLinearGradient(0, fadeTop, 0, off.height);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  o.fillStyle = g;
  o.fillRect(0, fadeTop, off.width, off.height - fadeTop);
  return off;
}

// The whole of an image — the brand mark — as its own canvas at device
// resolution, so it goes through the same per-scale cache and shadowed
// drawImage as the mascot crops.
function makePlain(img, crop, { width, height }, scale) {
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.round(width * scale));
  off.height = Math.max(1, Math.round(height * scale));
  off.getContext('2d').drawImage(img, 0, 0, off.width, off.height);
  return off;
}

// The brand mark tinted to the ink it sits beside — the file is white
// on transparent, which the frame's paper would swallow — as its own
// canvas at device resolution.
function makeTinted(img, color, dims, scale) {
  const off = makePlain(img, null, dims, scale);
  const o = off.getContext('2d');
  o.globalCompositeOperation = 'source-in';
  o.fillStyle = color;
  o.fillRect(0, 0, off.width, off.height);
  return off;
}

// The mark's box from one side, the other following the image's aspect.
function logoDims(img, { width, height }) {
  const aspect = (img.naturalWidth || img.width) / (img.naturalHeight || img.height);
  return width ? { width, height: width / aspect } : { width: height * aspect, height };
}

// Where a theme's block ends, given where its own layout ends: the
// brand unit's band goes under the layout's bottom pad, then the pad
// again beneath it. A theme that paints a ground around its block (the
// grid's box) paints down to this.
function watermarkBottom(layoutHeight) {
  return layoutHeight - BOTTOM_PAD + WATERMARK.gap + WATERMARK.mark + BOTTOM_PAD;
}

// The brand, last, on every sticker — see WATERMARK. Drawn after the
// theme, so nothing a theme paints can cover it, into the band every
// layout leaves under its own content; arrives with the sign-off. The
// mark and the wordmark are measured together and placed as one, so
// the pair is centred (or set flush) as a unit; `mark` is the tinted
// raster from prepareSticker, or null if the file never loaded, when
// the wordmark signs alone. A theme may recolour the unit (dark ink on
// the frame's paper), drop the shadow (on its own ground) or move it.
function drawWatermark(ctx, scale, cy, reveal, style = {}, mark = null) {
  const { color = '#ffffff', alpha = WATERMARK.alpha, shadow = true, align = 'center', x = STICKER_WIDTH / 2 } = style;
  part(ctx, reveal.signoff, 6, () => {
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.globalAlpha *= alpha;
    font(ctx, WATERMARK);
    const textW = spacedWidth(ctx, WATERMARK.text, WATERMARK.spacing);
    const markW = mark ? mark.width + WATERMARK.markGap : 0;
    const total = markW + textW;
    const left = align === 'left' ? x : align === 'right' ? x - total : x - total / 2;
    if (mark) {
      ctx.save();
      if (shadow) setShadow(ctx, 'art', scale);
      else clearShadow(ctx);
      ctx.drawImage(mark.canvas, left, cy - mark.height / 2, mark.width, mark.height);
      ctx.restore();
    }
    if (shadow) setShadow(ctx, 'text', scale);
    else clearShadow(ctx);
    ctx.fillStyle = color;
    drawSpaced(ctx, WATERMARK.text, left + markW, cy + 1, WATERMARK.spacing);
  });
}

async function loadSprite(mascotId, stage, equippedAccessories) {
  const img = await loadImage(mascotSpriteFor(mascotId, stage, equippedAccessories));
  return img ?? loadImage(mascotSpriteFor(mascotId, stage));
}

async function loadDisplayFont() {
  if (typeof document === 'undefined' || typeof document.fonts?.load !== 'function') return;
  await Promise.all([document.fonts.load(`${BIG.px}px Anton`), document.fonts.load(`${CLEAN_ROW.name}px Anton`)]).catch(
    () => null,
  );
}

// ── the stacked layout: classic ────────────────────────────────────────
//
// Eyebrow, the two figures, a hairline, the exercises, the mascot's bust
// and the wordmark, top to bottom. The ink comes in as a palette so the
// drawing never names a colour itself.

// The headline figures at stage `count` of their count-up: the time,
// the sets, and — for a session that moved any load — the volume.
function statFigures(data, count = 1) {
  const clock = clockAt(data.durationMs, count);
  const figures = [
    { label: 'TIME', value: clock.value, unit: clock.unit },
    { label: 'SETS', value: setsAt(data.setCount, count), unit: '' },
  ];
  if (data.totalVolumeKg > 0) {
    figures.push({ label: 'VOLUME', value: formatVolume(data.totalVolumeKg * count), unit: 'KG' });
  }
  return figures;
}

// The figures side by side, shrunk together until they fit, and where
// each one starts.
function measureStats(ctx, data, maxWidth) {
  const figures = statFigures(data);
  const measure = (px) => {
    font(ctx, { px, weight: STAT.weight });
    const widths = figures.map((figure) => ctx.measureText(figure.value).width);
    font(ctx, UNIT);
    const unitWidths = figures.map((figure) => (figure.unit ? 6 + spacedWidth(ctx, figure.unit, UNIT.spacing) : 0));
    const total =
      widths.reduce((a, b) => a + b, 0) + unitWidths.reduce((a, b) => a + b, 0) + STAT_GAP * (figures.length - 1);
    return { px, widths, unitWidths, total };
  };
  let stats = measure(STAT.px);
  while (stats.total > maxWidth && stats.px > STAT.min) stats = measure(stats.px - 2);
  let x = 0;
  const offsets = figures.map((_, i) => {
    const at = x;
    x += stats.widths[i] + stats.unitWidths[i] + STAT_GAP;
    return at;
  });
  return { ...stats, figures, offsets };
}

// Each row: where it starts and how tall it is.
function layoutRows(rows, top) {
  let y = top;
  const boxes = rows.map(() => {
    const box = { top: y, h: ROW.h };
    y += ROW.h + ROW.gap;
    return box;
  });
  if (rows.length > 0) y -= ROW.gap;
  return { boxes, bottom: y };
}

function layoutStack(ctx, data) {
  const pad = PAD;
  const contentW = CONTENT_W;
  let y = pad;
  const eyebrowY = y + 6;
  y += 12 + 12;

  const stats = measureStats(ctx, data, contentW);
  const statTop = y;
  const statBaseline = statTop + STAT_LABEL.px + 7 + Math.round(stats.px * 0.76);
  y = statBaseline + 10;

  const ruleY = y;
  y += 1 + 10;

  const list = layoutRows(data.rows, y);
  y = list.bottom + 12;

  // The sign-off: bust centred, the sticker ending right beneath its
  // fade. The wordmark follows, as on every theme — drawWatermark.
  const bustTop = y;
  const bustH = data.art?.height ?? 0;
  y = bustTop + bustH + BOTTOM_PAD;

  return {
    pad,
    contentW,
    eyebrowY,
    statTop,
    statBaseline,
    stats,
    ruleY,
    rowBoxes: list.boxes,
    bustTop,
    height: y,
  };
}

// The figures, at stage `count` of their count-up.
function drawStats(ctx, scale, data, layout, palette, reveal) {
  const { pad, statTop, statBaseline, stats } = layout;
  const count = easeOutCubic(clamp01(reveal.stats));
  const live = statFigures(data, count);
  stats.figures.forEach((figure, i) => {
    const x = pad + stats.offsets[i];
    part(ctx, reveal.header, -4, () => {
      setShadow(ctx, 'text', scale);
      font(ctx, STAT_LABEL);
      ctx.fillStyle = palette.label;
      drawSpaced(ctx, figure.label, x, statTop + STAT_LABEL.px / 2, STAT_LABEL.spacing);
    });
    if (reveal.stats <= 0) return;
    ctx.save();
    ctx.globalAlpha *= lerp(0.35, 1, count);
    ctx.textBaseline = 'alphabetic';
    setShadow(ctx, 'big', scale);
    font(ctx, { px: stats.px, weight: STAT.weight });
    ctx.fillStyle = palette.number;
    ctx.fillText(live[i].value, x, statBaseline);
    const valueW = ctx.measureText(live[i].value).width;
    if (figure.unit) {
      setShadow(ctx, 'text', scale);
      font(ctx, UNIT);
      ctx.fillStyle = palette.unit;
      drawSpaced(ctx, figure.unit, x + valueW + 6, statBaseline, UNIT.spacing);
    }
    ctx.restore();
  });
}

// The exercises, left-aligned, one name to a row.
function drawRowsLeft(ctx, scale, data, layout, palette, reveal) {
  const { pad, contentW, rowBoxes } = layout;
  data.rows.forEach((row, i) => {
    part(ctx, reveal.row(i), 8, () => {
      const box = rowBoxes[i];
      setShadow(ctx, 'text', scale);
      font(ctx, { px: ROW.name, weight: ROW.weight });
      ctx.fillStyle = palette.name;
      ctx.fillText(truncate(ctx, row.name, contentW), pad, box.top + box.h / 2 + 0.5);
    });
  });
}

// The mascot's bust, centred. The wordmark that used to sit under it is
// now every theme's, drawn last — see drawWatermark.
function drawSignoff(ctx, scale, layout, reveal, art) {
  if (!art) return;
  part(ctx, reveal.signoff, 10, () => {
    ctx.save();
    setShadow(ctx, 'art', scale);
    ctx.drawImage(art.canvas, (STICKER_WIDTH - art.width) / 2, layout.bustTop, art.width, art.height);
    ctx.restore();
  });
}

function drawStack(ctx, scale, data, layout, palette, reveal, art) {
  const { pad, contentW, eyebrowY, ruleY } = layout;
  const left = pad;
  const right = pad + contentW;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // ── Eyebrow: what this is, and when ──
  part(ctx, reveal.header, -6, () => {
    setShadow(ctx, 'text', scale);
    font(ctx, EYEBROW);
    ctx.fillStyle = palette.eyebrow;
    drawSpaced(ctx, 'WORKOUT COMPLETE', left, eyebrowY, EYEBROW.spacing);
    if (data.date) {
      ctx.fillStyle = palette.date;
      drawSpaced(ctx, data.date, right, eyebrowY, EYEBROW.spacing, 'right');
    }
  });

  drawStats(ctx, scale, data, layout, palette, reveal);

  // ── Hairline, drawn from the left as the figures land ──
  const ruleW = contentW * clamp01(reveal.rule);
  if (ruleW > 0) {
    ctx.save();
    setShadow(ctx, 'text', scale);
    ctx.fillStyle = palette.rule;
    ctx.fillRect(left, ruleY, ruleW, 1);
    ctx.restore();
  }

  drawRowsLeft(ctx, scale, data, layout, palette, reveal);
  drawSignoff(ctx, scale, layout, reveal, art);
}

const WHITE_INK = {
  eyebrow: '#ffffff',
  date: ink(0.88),
  label: ink(0.9),
  number: '#ffffff',
  unit: '#ffffff',
  rule: ink(0.7),
  name: '#ffffff',
};

const classic = {
  mascotStage: BUST_STAGE,
  layout: layoutStack,
  artDims: (sprite, data) =>
    cropDims(sprite, BUST[data.mascotId] ?? BUST.jimmy, (BUST[data.mascotId] ?? BUST.jimmy).height),
  artCrop: (data) => BUST[data.mascotId] ?? BUST.jimmy,
  draw: (ctx, scale, data, layout, art, reveal) => drawStack(ctx, scale, data, layout, WHITE_INK, reveal, art),
};

// ── the typographic theme ──────────────────────────────────────────────
//
// No picture. The time as big as the sticker allows, in the display
// face, its unit beside it; a heavy rule; the tally; then the exercises
// set in the same face, each on its own hairline with its set count
// flush right. Left-aligned throughout — the whole thing hangs off one
// edge, like a page.

function layoutClean(ctx, data) {
  let y = PAD;
  const eyebrowY = y + 6;
  y += 12 + 12;

  // The figure at its largest, its unit beside it.
  const measureBig = (px) => {
    font(ctx, { px, family: ARCADE });
    const w = ctx.measureText(data.clock.value).width;
    font(ctx, { px: BIG_UNIT.px, family: ARCADE });
    return w + 8 + spacedWidth(ctx, data.clock.unit, BIG_UNIT.spacing);
  };
  const bigPx = fitPx(measureBig, CONTENT_W, BIG.px, BIG.min);
  font(ctx, { px: bigPx, family: ARCADE });
  const bigCap = capHeight(ctx);
  const bigW = ctx.measureText(data.clock.value).width;
  const bigTop = y;
  const bigBaseline = bigTop + bigCap;
  y = bigBaseline + 10;

  const ruleY = y;
  y += BIG_RULE + 9;

  const tallyCy = y + TALLY.px / 2;
  y += TALLY.px + 14;

  // Rows: one name to a line, a hairline closing each; the brand unit
  // signs the page beneath (drawWatermark).
  const rowBoxes = data.rows.map(() => {
    const box = { top: y, h: CLEAN_ROW.h };
    y += CLEAN_ROW.h;
    return box;
  });
  y += BOTTOM_PAD;

  return { eyebrowY, bigPx, bigW, bigTop, bigBaseline, ruleY, tallyCy, rowBoxes, height: y };
}

function drawClean(ctx, scale, data, layout, art, reveal) {
  const { eyebrowY, bigPx, bigBaseline, ruleY, tallyCy, rowBoxes } = layout;
  const left = PAD;
  const right = PAD + CONTENT_W;
  const palette = WHITE_INK;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  part(ctx, reveal.header, -6, () => {
    setShadow(ctx, 'text', scale);
    font(ctx, EYEBROW);
    ctx.fillStyle = palette.eyebrow;
    drawSpaced(ctx, 'WORKOUT COMPLETE', left, eyebrowY, EYEBROW.spacing);
    if (data.date) {
      ctx.fillStyle = palette.date;
      drawSpaced(ctx, data.date, right, eyebrowY, EYEBROW.spacing, 'right');
    }
  });

  // The big figure, counting up.
  const count = easeOutCubic(clamp01(reveal.stats));
  if (reveal.stats > 0) {
    const clock = clockAt(data.durationMs, count);
    ctx.save();
    ctx.globalAlpha *= lerp(0.35, 1, count);
    ctx.textBaseline = 'alphabetic';
    setShadow(ctx, 'big', scale);
    font(ctx, { px: bigPx, family: ARCADE });
    ctx.fillStyle = '#ffffff';
    ctx.fillText(clock.value, left, bigBaseline);
    const w = ctx.measureText(clock.value).width;
    setShadow(ctx, 'text', scale);
    font(ctx, { px: BIG_UNIT.px, family: ARCADE });
    drawSpaced(ctx, clock.unit, left + w + 8, bigBaseline, BIG_UNIT.spacing);
    ctx.restore();
  }

  // The heavy rule, drawn from the left.
  const ruleW = CONTENT_W * clamp01(reveal.rule);
  if (ruleW > 0) {
    ctx.save();
    setShadow(ctx, 'text', scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(left, ruleY, ruleW, BIG_RULE);
    ctx.restore();
  }

  // The tally: sets and exercises.
  part(ctx, reveal.rule, 4, () => {
    setShadow(ctx, 'text', scale);
    font(ctx, { px: TALLY.px, family: ARCADE });
    ctx.fillStyle = '#ffffff';
    const sets = `${setsAt(data.setCount, count)} SET${data.setCount === 1 ? '' : 'S'}`;
    const n = data.exerciseCount;
    const tally =
      data.totalVolumeKg > 0
        ? `${sets} · ${formatVolume(data.totalVolumeKg * count)} KG`
        : `${sets} · ${n} EXERCISE${n === 1 ? '' : 'S'}`;
    drawSpaced(ctx, tally, left, tallyCy + 1, TALLY.spacing);
  });

  data.rows.forEach((row, i) => {
    part(ctx, reveal.row(i), 8, () => {
      const box = rowBoxes[i];
      const cy = box.top + CLEAN_ROW.top;
      setShadow(ctx, 'text', scale);
      font(ctx, { px: CLEAN_ROW.name, family: ARCADE });
      ctx.fillStyle = '#ffffff';
      ctx.fillText(truncate(ctx, row.name.toUpperCase(), CONTENT_W), left, cy + 0.5);
      ctx.fillStyle = ink(CLEAN_ROW.hairline);
      ctx.fillRect(left, box.top + box.h - 1, CONTENT_W, 1);
    });
  });
}

const clean = {
  mascotStage: null,
  fonts: true,
  layout: layoutClean,
  draw: drawClean,
};

// ── the hero theme ─────────────────────────────────────────────────────
//
// The mascot big in the middle, head and torso fading out at the chest;
// the time stacked in the column to their left and the sets in the
// column to their right, at shoulder height; the exercises centred
// underneath, tucked into the fade; the wordmark last.

function layoutHero(ctx, data) {
  let y = PAD;
  const eyebrowY = y + 6;
  const dateY = eyebrowY + 14;
  y = (data.date ? dateY : eyebrowY) + 6 + 10;

  const art = data.art ?? { width: 0, height: 0 };
  const bustTop = y;
  const colW = Math.max(40, (CONTENT_W - art.width) / 2 - 4);
  const leftCx = PAD + colW / 2;
  const rightCx = STICKER_WIDTH - PAD - colW / 2;
  const shoulderY = bustTop + art.height * 0.5;
  const measureStat = (value) => (px) => {
    font(ctx, { px, weight: STAT.weight });
    return ctx.measureText(value).width;
  };
  const statPx = Math.min(
    fitPx(measureStat(data.clock.value), colW, HERO_STAT.px, HERO_STAT.min),
    fitPx(measureStat(data.sets), colW, HERO_STAT.px, HERO_STAT.min),
  );
  const stat = {
    px: statPx,
    labelCy: shoulderY - statPx * 0.5 - 10,
    baseline: shoulderY + statPx * 0.36,
    unitCy: shoulderY + statPx * 0.36 + 13,
  };
  // The rows begin in the fade, so the list reads as one block with the
  // figure rather than a second thing under it.
  y = bustTop + art.height - (art.height > 0 ? 16 : 0);

  // The volume: the third figure, with no column left to stack it in,
  // so it sits centred where the fade ends, before the list.
  let volume = null;
  if (data.totalVolumeKg > 0) {
    volume = { labelCy: y + 5, baseline: y + 10 + 6 + Math.round(HERO_VOLUME.px * 0.76) };
    y = volume.baseline + 14;
  }

  const list = layoutRows(data.rows, y);
  y = list.bottom + BOTTOM_PAD;

  return {
    eyebrowY,
    dateY,
    bustTop,
    leftCx,
    rightCx,
    colW,
    stat,
    volume,
    rowBoxes: list.boxes,
    height: y,
  };
}

function drawHero(ctx, scale, data, layout, art, reveal) {
  const { eyebrowY, dateY, bustTop, leftCx, rightCx, stat, volume, rowBoxes } = layout;
  const cx = STICKER_WIDTH / 2;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // The figure first, so everything else sits over its fade.
  if (art) {
    part(ctx, reveal.intro, 12, () => {
      setShadow(ctx, 'art', scale);
      ctx.drawImage(art.canvas, cx - art.width / 2, bustTop, art.width, art.height);
    });
  }

  part(ctx, reveal.header, -6, () => {
    setShadow(ctx, 'text', scale);
    font(ctx, EYEBROW);
    ctx.fillStyle = '#ffffff';
    drawSpaced(ctx, 'WORKOUT COMPLETE', cx, eyebrowY, EYEBROW.spacing, 'center');
    if (data.date) {
      ctx.fillStyle = ink(0.88);
      drawSpaced(ctx, data.date, cx, dateY, EYEBROW.spacing, 'center');
    }
  });

  // The two figures, stacked in their columns.
  const count = easeOutCubic(clamp01(reveal.stats));
  const clock = clockAt(data.durationMs, count);
  const sets = setsAt(data.setCount, count);
  const drawStat = (colCx, label, value, unit) => {
    part(ctx, reveal.header, -4, () => {
      setShadow(ctx, 'text', scale);
      font(ctx, STAT_LABEL);
      ctx.fillStyle = ink(0.9);
      drawSpaced(ctx, label, colCx, stat.labelCy, STAT_LABEL.spacing, 'center');
    });
    if (reveal.stats <= 0) return;
    ctx.save();
    ctx.globalAlpha *= lerp(0.35, 1, count);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    setShadow(ctx, 'big', scale);
    font(ctx, { px: stat.px, weight: STAT.weight });
    ctx.fillStyle = '#ffffff';
    ctx.fillText(value, colCx, stat.baseline);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (unit) {
      setShadow(ctx, 'text', scale);
      font(ctx, UNIT);
      drawSpaced(ctx, unit, colCx, stat.unitCy, UNIT.spacing, 'center');
    }
    ctx.restore();
  };
  drawStat(leftCx, 'TIME', clock.value, clock.unit);
  drawStat(rightCx, 'SETS', sets, '');
  if (volume) {
    part(ctx, reveal.header, -4, () => {
      setShadow(ctx, 'text', scale);
      font(ctx, STAT_LABEL);
      ctx.fillStyle = ink(0.9);
      drawSpaced(ctx, 'VOLUME', cx, volume.labelCy, STAT_LABEL.spacing, 'center');
    });
    if (reveal.stats > 0) {
      const value = formatVolume(data.totalVolumeKg * count);
      ctx.save();
      ctx.globalAlpha *= lerp(0.35, 1, count);
      ctx.textBaseline = 'alphabetic';
      font(ctx, { px: HERO_VOLUME.px, weight: STAT.weight });
      const valueW = ctx.measureText(value).width;
      font(ctx, UNIT);
      const unitW = spacedWidth(ctx, 'KG', UNIT.spacing);
      const left = cx - (valueW + 6 + unitW) / 2;
      setShadow(ctx, 'big', scale);
      font(ctx, { px: HERO_VOLUME.px, weight: STAT.weight });
      ctx.fillStyle = '#ffffff';
      ctx.fillText(value, left, volume.baseline);
      setShadow(ctx, 'text', scale);
      font(ctx, UNIT);
      drawSpaced(ctx, 'KG', left + valueW + 6, volume.baseline, UNIT.spacing);
      ctx.restore();
    }
  }

  // The exercises, each name centred on its own row.
  data.rows.forEach((row, i) => {
    part(ctx, reveal.row(i), 8, () => {
      const box = rowBoxes[i];
      setShadow(ctx, 'text', scale);
      font(ctx, { px: ROW.name, weight: ROW.weight });
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(truncate(ctx, row.name, CONTENT_W), cx, box.top + box.h / 2 + 0.5);
      ctx.textAlign = 'left';
    });
  });
}

const hero = {
  mascotStage: BUST_STAGE,
  layout: layoutHero,
  artDims: (sprite) => {
    const srcW = sprite.naturalWidth || sprite.width;
    const srcH = (sprite.naturalHeight || sprite.height) * HERO.fraction;
    const height = Math.min(HERO.maxHeight, HERO.maxWidth * (srcH / srcW));
    return cropDims(sprite, HERO, height);
  },
  artCrop: () => HERO,
  draw: drawHero,
};

// ── the three that say less ─────────────────────────────────────────────
//
// No exercise names on any of these, and the volume first on all of
// them — the minutes standing in only for a session that moved no load.

// "62 MINS", "1 MIN".
function minutesLabel(durationMs) {
  const minutes = Math.max(0, Math.round((Number(durationMs) || 0) / 60000));
  return `${minutes} MIN${minutes === 1 ? '' : 'S'}`;
}

// "10,840 KG", or the minutes for a session with no load to count.
function volumeOrMinutes(data) {
  return data.totalVolumeKg > 0 ? `${formatVolume(data.totalVolumeKg)} KG` : minutesLabel(data.durationMs);
}

// The size at which `text`, tracked at `track` of its size per glyph,
// is `targetW` wide — clamped to [minPx, maxPx]. Tracking scales with
// the type, so the same line keeps its texture at any size.
function fitTracked(ctx, text, { targetW, maxPx, minPx, weight, track }) {
  font(ctx, { px: 100, weight });
  const w100 = spacedWidth(ctx, text, 100 * track);
  let px = Math.max(minPx, Math.min(maxPx, w100 > 0 ? (targetW / w100) * 100 : maxPx));
  px = Math.round(px * 2) / 2;
  font(ctx, { px, weight });
  return { text, px, weight, track, spacing: px * track, width: spacedWidth(ctx, text, px * track) };
}

// ── the inverted pyramid ──
//
// Four lines, centred. Each is set to a fraction of the top line's
// width and then MEASURED against the line above it: whatever the words
// and the size clamps do, a line is shrunk until it comes in at least
// `step` narrower than its predecessor, so the silhouette is a ▼ for any
// session. The bottom line is the name, lowercase and lighter — the
// point of the triangle.
const PYRAMID = {
  lines: [
    { ratio: 1, maxPx: 17, minPx: 11, weight: 700, track: 0.3 },
    { ratio: 0.78, maxPx: 13, minPx: 9, weight: 600, track: 0.24 },
    { ratio: 0.5, maxPx: 17, minPx: 9, weight: 700, track: 0.28 },
  ],
  gap: 12,
  step: 12,
};

function pyramidLines(data) {
  return [
    'WORKOUT COMPLETED',
    `${volumeOrMinutes(data)} • ${minutesLabel(data.durationMs)}`,
    `${data.setCount} SET${data.setCount === 1 ? '' : 'S'}`,
  ];
}

function layoutPyramid(ctx, data) {
  const texts = pyramidLines(data);
  // A session with no load says the minutes twice on line 2; drop the
  // second mention rather than print "62 MINS • 62 MINS".
  if (data.totalVolumeKg <= 0) texts[1] = `BODYWEIGHT • ${minutesLabel(data.durationMs)}`;
  const lines = [];
  texts.forEach((text, i) => {
    const spec = PYRAMID.lines[i];
    const above = lines[i - 1] ?? null;
    const line = fitTracked(ctx, text, { targetW: lines[0] ? lines[0].width * spec.ratio : CONTENT_W, ...spec });
    while (above && line.width > above.width - PYRAMID.step && line.px > spec.minPx) {
      line.px -= 0.5;
      line.spacing = line.px * spec.track;
      font(ctx, { px: line.px, weight: spec.weight });
      line.width = spacedWidth(ctx, text, line.spacing);
    }
    lines.push(line);
  });
  let y = PAD;
  const placed = lines.map((line) => {
    const cy = y + line.px / 2;
    y += line.px + PYRAMID.gap;
    return { ...line, cy };
  });
  y -= PYRAMID.gap;
  y += BOTTOM_PAD;
  return { lines: placed, height: y };
}

// Three rows, and the brand unit under them as the apex (drawWatermark).
function drawPyramid(ctx, scale, data, layout, art, reveal) {
  const cx = STICKER_WIDTH / 2;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  layout.lines.forEach((line, i) => {
    part(ctx, reveal.row(i), -6, () => {
      setShadow(ctx, 'text', scale);
      font(ctx, { px: line.px, weight: line.weight });
      ctx.fillStyle = '#ffffff';
      drawSpaced(ctx, line.text, cx, line.cy + 0.5, line.spacing, 'center');
    });
  });
}

const pyramid = {
  mascotStage: null,
  beats: () => 3,
  layout: layoutPyramid,
  draw: drawPyramid,
};

// ── the brand looks ────────────────────────────────────────────────────
//
// Receipt, Frame (and Noir, its negative), Split, Grid and Pulse: five
// sports-brand and streetwear stickers, added as a set, on the same rules as the first four — the
// three figures, every exercise by name, and the brand unit at the foot
// (drawWatermark).

// Up to `maxLines` lines of `text`, broken at spaces to fit `maxWidth`
// in the current font; whatever does not fit the last line is
// ellipsised onto it.
function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && lines.length < maxLines - 1 && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(truncate(ctx, line, maxWidth));
  return lines;
}

// ── the receipt ────────────────────────────────────────────────────────
//
// A till receipt in monospace: the header, dashed rules, the figures
// with dot leaders, the exercises as line items, a barcode and a thank
// you — white ink, so it reads as a receipt printed onto the photo.
const MONO = "'Courier New', Courier, 'Liberation Mono', monospace";
const RECEIPT = {
  px: 11.5,
  lineH: 17,
  title: { px: 13, spacing: 3 },
  small: { px: 9.5, spacing: 1.5 },
  dash: [3, 3],
  gap: 9,
  barH: 22,
};

function receiptStats(data, count = 1) {
  const clock = clockAt(data.durationMs, count);
  const lines = [
    ['TIME', `${clock.value} ${clock.unit}`],
    ['SETS', setsAt(data.setCount, count)],
  ];
  if (data.totalVolumeKg > 0) lines.push(['VOLUME', `${formatVolume(data.totalVolumeKg * count)} KG`]);
  return lines;
}

function layoutReceipt(ctx, data) {
  let y = PAD;
  const titleCy = y + RECEIPT.title.px / 2;
  y += RECEIPT.title.px + 5;
  let dateCy = null;
  if (data.date) {
    dateCy = y + RECEIPT.small.px / 2;
    y += RECEIPT.small.px + 4;
  }
  const rules = [];
  const rule = () => {
    y += RECEIPT.gap;
    rules.push(y);
    y += RECEIPT.gap + 1;
  };
  rule();
  const statTop = y;
  y += RECEIPT.lineH * receiptStats(data).length;
  rule();
  const rowBoxes = data.rows.map(() => {
    const box = { top: y, h: RECEIPT.lineH };
    y += RECEIPT.lineH;
    return box;
  });
  rule();
  const barTop = y;
  y += RECEIPT.barH + BOTTOM_PAD;
  return { titleCy, dateCy, rules, statTop, rowBoxes, barTop, height: y };
}

function drawDashed(ctx, y, width) {
  ctx.save();
  ctx.setLineDash(RECEIPT.dash);
  ctx.lineWidth = 1;
  ctx.strokeStyle = ink(0.85);
  ctx.beginPath();
  ctx.moveTo(PAD, y + 0.5);
  ctx.lineTo(PAD + width, y + 0.5);
  ctx.stroke();
  ctx.restore();
}

function drawReceipt(ctx, scale, data, layout, art, reveal) {
  const { titleCy, dateCy, rules, statTop, rowBoxes, barTop } = layout;
  const cx = STICKER_WIDTH / 2;
  const left = PAD;
  const right = PAD + CONTENT_W;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  part(ctx, reveal.header, -6, () => {
    setShadow(ctx, 'text', scale);
    font(ctx, { px: RECEIPT.title.px, weight: 700, family: MONO });
    ctx.fillStyle = '#ffffff';
    drawSpaced(ctx, 'WORKOUT RECEIPT', cx, titleCy + 0.5, RECEIPT.title.spacing, 'center');
    if (dateCy !== null) {
      font(ctx, { px: RECEIPT.small.px, family: MONO });
      ctx.fillStyle = ink(0.8);
      drawSpaced(ctx, data.date, cx, dateCy + 0.5, RECEIPT.small.spacing, 'center');
    }
  });

  // The dashed rules, drawn from the left as the figures land.
  const ruleW = CONTENT_W * clamp01(reveal.rule);
  if (ruleW > 0) {
    setShadow(ctx, 'text', scale);
    rules.forEach((y) => drawDashed(ctx, y, ruleW));
  }

  // The figures, counting up, dot leaders running out to each value.
  const count = easeOutCubic(clamp01(reveal.stats));
  if (reveal.stats > 0) {
    ctx.save();
    ctx.globalAlpha *= lerp(0.35, 1, count);
    setShadow(ctx, 'text', scale);
    font(ctx, { px: RECEIPT.px, weight: 700, family: MONO });
    const dotW = ctx.measureText('.').width;
    receiptStats(data, count).forEach(([label, value], i) => {
      const cy = statTop + RECEIPT.lineH * (i + 0.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, left, cy + 0.5);
      ctx.textAlign = 'right';
      ctx.fillText(value, right, cy + 0.5);
      ctx.textAlign = 'left';
      const labelW = ctx.measureText(label).width;
      const valueW = ctx.measureText(value).width;
      const dots = Math.floor((CONTENT_W - labelW - valueW - 12) / dotW);
      if (dots > 0) {
        ctx.fillStyle = ink(0.4);
        ctx.fillText('.'.repeat(dots), left + labelW + 6, cy + 0.5);
      }
    });
    ctx.restore();
  }

  // The line items, numbered the way a till numbers them.
  data.rows.forEach((row, i) => {
    part(ctx, reveal.row(i), 8, () => {
      const box = rowBoxes[i];
      const cy = box.top + box.h / 2;
      setShadow(ctx, 'text', scale);
      font(ctx, { px: RECEIPT.px, family: MONO });
      const index = String(i + 1).padStart(2, '0');
      ctx.fillStyle = ink(0.55);
      ctx.fillText(index, left, cy + 0.5);
      const indexW = ctx.measureText(`${index}   `).width;
      font(ctx, { px: RECEIPT.px, weight: 700, family: MONO });
      ctx.fillStyle = '#ffffff';
      ctx.fillText(truncate(ctx, row.name.toUpperCase(), CONTENT_W - indexW), left + indexW, cy + 0.5);
    });
  });

  // The barcode — bars of one to three units, seeded on the session so
  // two receipts never carry the same one. Nothing is said under it:
  // the receipt is the data and the brand, and no more.
  part(ctx, reveal.signoff, 6, () => {
    setShadow(ctx, 'text', scale);
    ctx.fillStyle = '#ffffff';
    const seed = data.setCount * 7 + Math.round(data.totalVolumeKg);
    let x = left + 10;
    let i = 0;
    while (x < right - 10) {
      const w = ((i * 7 + seed) % 3) + 1;
      ctx.fillRect(x, barTop, w, RECEIPT.barH);
      x += w + ((i * 5 + seed) % 2) + 1.5;
      i += 1;
    }
  });
}

const receipt = { mascotStage: null, layout: layoutReceipt, draw: drawReceipt };

// A Polaroid: paper with a window cut for the photo, the session
// written along the wide bottom border, the brand unit last, where
// the real thing gets its caption. It fills the story — `side` of
// paper down each edge, a wider band along the foot — and comes in
// two papers (FRAME_PAPERS): white with dark ink, the one look set in
// dark type, since here the paper is the ground; and its negative,
// black with white ink. Same geometry, same code, one colour pair.
const FRAME = {
  side: 40,
  top: 40,
  line: { px: 14, min: 9, spacing: 1.8 },
  row: { px: 11, h: 15 },
  gapTop: 22,
  windowMin: 180,
};

const FRAME_PAPERS = {
  white: { paper: '#ffffff', ink: '#1c1c1c' },
  black: { paper: '#000000', ink: '#ffffff' },
};

function frameLine(data, count = 1) {
  const clock = clockAt(data.durationMs, count);
  const parts = [`${clock.value} ${clock.unit}`, `${setsAt(data.setCount, count)} SETS`];
  if (data.totalVolumeKg > 0) parts.push(`${formatVolume(data.totalVolumeKg * count)} KG`);
  return parts.join('  ·  ');
}

function layoutFrame(ctx, data) {
  // The band is built from what it holds — the line, the names, the
  // brand unit — and the window takes whatever is left above it, never
  // less than windowMin.
  const innerW = STICKER_WIDTH - FRAME.side * 2;
  const measure = (px) => {
    font(ctx, { px, weight: 800 });
    return spacedWidth(ctx, frameLine(data), FRAME.line.spacing);
  };
  const linePx = fitPx(measure, innerW, FRAME.line.px, FRAME.line.min);
  const rowsH = data.rows.length * FRAME.row.h + (data.rows.length > 0 ? 4 : 0);
  const bandH = FRAME.gapTop + linePx + 10 + rowsH + WATERMARK.gap + WATERMARK.mark + FRAME.side;
  const windowH = Math.max(FRAME.windowMin, STICKER_HEIGHT - FRAME.top - bandH);
  let y = FRAME.top + windowH + FRAME.gapTop;
  const lineCy = y + linePx / 2;
  y += linePx + 10;
  const rowBoxes = data.rows.map(() => {
    const box = { top: y, h: FRAME.row.h };
    y += FRAME.row.h;
    return box;
  });
  if (data.rows.length > 0) y += 4;
  const watermarkCy = y + WATERMARK.gap + WATERMARK.mark / 2;
  return { linePx, lineCy, rowBoxes, windowH, watermarkCy, height: STICKER_HEIGHT };
}

function drawFrame(ctx, scale, data, layout, art, reveal, paper) {
  const { linePx, lineCy, rowBoxes, windowH } = layout;
  const cx = STICKER_WIDTH / 2;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // The paper, with the window left open — one even-odd shape rather
  // than a fill cleared out afterwards, so whatever is under the window
  // (the photo, or the clip's backdrop) is never touched.
  part(ctx, reveal.intro, 0, () => {
    ctx.save();
    setShadow(ctx, 'art', scale);
    ctx.fillStyle = paper.paper;
    ctx.beginPath();
    ctx.rect(0, 0, STICKER_WIDTH, STICKER_HEIGHT);
    ctx.rect(FRAME.side, FRAME.top, STICKER_WIDTH - FRAME.side * 2, windowH);
    ctx.fill('evenodd');
    ctx.restore();
  });

  const count = easeOutCubic(clamp01(reveal.stats));
  if (reveal.stats > 0) {
    ctx.save();
    ctx.globalAlpha *= lerp(0.35, 1, count);
    clearShadow(ctx);
    font(ctx, { px: linePx, weight: 800 });
    ctx.fillStyle = paper.ink;
    drawSpaced(ctx, frameLine(data, count), cx, lineCy + 0.5, FRAME.line.spacing, 'center');
    ctx.restore();
  }

  // The names, centred under the line like a caption.
  data.rows.forEach((row, i) => {
    part(ctx, reveal.row(i), 6, () => {
      const box = rowBoxes[i];
      clearShadow(ctx);
      font(ctx, { px: FRAME.row.px, weight: 600 });
      ctx.fillStyle = paper.ink;
      ctx.textAlign = 'center';
      ctx.fillText(truncate(ctx, row.name, STICKER_WIDTH - FRAME.side * 2), cx, box.top + box.h / 2 + 0.5);
      ctx.textAlign = 'left';
    });
  });
}

function makeFrame(paper) {
  return {
    mascotStage: null,
    fill: true,
    watermark: { color: paper.ink, alpha: 0.6, shadow: false },
    layout: layoutFrame,
    draw: (ctx, scale, data, layout, art, reveal) => drawFrame(ctx, scale, data, layout, art, reveal, paper),
  };
}

const frame = makeFrame(FRAME_PAPERS.white);
const noir = makeFrame(FRAME_PAPERS.black);

// Everything set flush left in a narrow column down the left third —
// the figures one over the other, the exercises under them — and
// nothing on the right two thirds, where the photo is. Nothing painted
// behind it either: the type floats on the photo, shadowed like every
// other look. Athletic-promo typography, hard edges.
const SPLIT = {
  fraction: 0.35,
  eyebrow: { px: 8.5, spacing: 2 },
  label: { px: 8, spacing: 1.8 },
  big: { px: 30, min: 16 },
  unit: { px: 8.5, spacing: 1.5 },
  name: { px: 10.5, lineH: 12 },
  blockGap: 12,
  rowGap: 7,
};
const SPLIT_W = Math.round(STICKER_WIDTH * SPLIT.fraction);
const SPLIT_INNER = SPLIT_W - PAD - 6;

function splitFigures(data, count = 1) {
  const clock = clockAt(data.durationMs, count);
  const figures = [];
  if (data.totalVolumeKg > 0) {
    figures.push({ label: 'VOLUME', value: formatVolume(data.totalVolumeKg * count), unit: 'KG' });
  }
  figures.push({ label: 'TIME', value: clock.value, unit: clock.unit });
  figures.push({ label: 'SETS', value: setsAt(data.setCount, count), unit: '' });
  return figures;
}

function layoutSplit(ctx, data) {
  let y = PAD;
  const eyebrow = ['WORKOUT', 'COMPLETE'].map((text, i) => ({
    text,
    cy: y + SPLIT.eyebrow.px / 2 + i * (SPLIT.eyebrow.px + 4),
  }));
  y += (SPLIT.eyebrow.px + 4) * 2;
  let dateCy = null;
  if (data.date) {
    dateCy = y + SPLIT.label.px / 2;
    y += SPLIT.label.px + 4;
  }
  y += 10;
  const measure = (value) => (px) => {
    font(ctx, { px, weight: 800 });
    return ctx.measureText(value).width;
  };
  const figures = splitFigures(data).map((figure) => {
    const px = fitPx(measure(figure.value), SPLIT_INNER, SPLIT.big.px, SPLIT.big.min);
    const labelCy = y + SPLIT.label.px / 2;
    y += SPLIT.label.px + 5;
    font(ctx, { px, weight: 800 });
    const baseline = y + capHeight(ctx);
    y = baseline + 5;
    let unitCy = null;
    if (figure.unit) {
      unitCy = y + SPLIT.unit.px / 2;
      y += SPLIT.unit.px + 2;
    }
    y += SPLIT.blockGap;
    return { ...figure, px, labelCy, baseline, unitCy };
  });
  y += 2;
  // Names wrap to two lines rather than truncate: the column is narrow
  // and "Incline Dumbbell Press" deserves both its words.
  font(ctx, { px: SPLIT.name.px, weight: 700 });
  const rowBoxes = data.rows.map((row) => {
    const lines = wrapLines(ctx, row.name, SPLIT_INNER, 2);
    const h = lines.length * SPLIT.name.lineH;
    const box = { top: y, h, lines };
    y += h + SPLIT.rowGap;
    return box;
  });
  if (data.rows.length > 0) y -= SPLIT.rowGap;
  y += BOTTOM_PAD;
  return { eyebrow, dateCy, figures, rowBoxes, height: y };
}

function drawSplit(ctx, scale, data, layout, art, reveal) {
  const { eyebrow, dateCy, figures, rowBoxes } = layout;
  const left = PAD;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  part(ctx, reveal.header, -6, () => {
    setShadow(ctx, 'text', scale);
    font(ctx, { px: SPLIT.eyebrow.px, weight: 800 });
    ctx.fillStyle = '#ffffff';
    eyebrow.forEach((line) => drawSpaced(ctx, line.text, left, line.cy + 0.5, SPLIT.eyebrow.spacing));
    if (dateCy !== null) {
      font(ctx, { px: SPLIT.label.px, weight: 700 });
      ctx.fillStyle = ink(0.75);
      drawSpaced(ctx, data.date, left, dateCy + 0.5, 1.2);
    }
  });

  const count = easeOutCubic(clamp01(reveal.stats));
  const live = splitFigures(data, count);
  figures.forEach((figure, i) => {
    part(ctx, reveal.header, -4, () => {
      setShadow(ctx, 'text', scale);
      font(ctx, { px: SPLIT.label.px, weight: 700 });
      ctx.fillStyle = ink(0.75);
      drawSpaced(ctx, figure.label, left, figure.labelCy + 0.5, SPLIT.label.spacing);
    });
    if (reveal.stats <= 0) return;
    ctx.save();
    ctx.globalAlpha *= lerp(0.35, 1, count);
    ctx.textBaseline = 'alphabetic';
    setShadow(ctx, 'big', scale);
    font(ctx, { px: figure.px, weight: 800 });
    ctx.fillStyle = '#ffffff';
    ctx.fillText(live[i].value, left, figure.baseline);
    ctx.textBaseline = 'middle';
    if (figure.unitCy !== null) {
      setShadow(ctx, 'text', scale);
      font(ctx, { px: SPLIT.unit.px, weight: 700 });
      ctx.fillStyle = ink(0.85);
      drawSpaced(ctx, figure.unit, left, figure.unitCy + 0.5, SPLIT.unit.spacing);
    }
    ctx.restore();
  });

  data.rows.forEach((row, i) => {
    part(ctx, reveal.row(i), 6, () => {
      const box = rowBoxes[i];
      setShadow(ctx, 'text', scale);
      font(ctx, { px: SPLIT.name.px, weight: 700 });
      ctx.fillStyle = '#ffffff';
      box.lines.forEach((line, k) => ctx.fillText(line, left, box.top + SPLIT.name.lineH * (k + 0.5) + 0.5));
    });
  });
}

const split = {
  mascotStage: null,
  watermark: { align: 'left', x: PAD },
  layout: layoutSplit,
  draw: drawSplit,
};

// ── the grid ───────────────────────────────────────────────────────────
//
// Swiss: a box ruled into cells by hairlines, every figure locked into
// one — the two big ones side by side across the top, the small ones
// under them, the exercises ruled row by row beneath, and the wordmark
// in a cell of its own at the foot.
const GRID = {
  alpha: 0.72,
  pad: 10,
  head: 22,
  cell: 74,
  cell2: 38,
  row: 24,
  label: { px: 8.5, spacing: 2 },
  big: { px: 34, min: 18 },
  unit: { px: 9, spacing: 1.5 },
  small: { px: 20, min: 12 },
  name: { px: 11.5 },
};

function gridFigures(data, count = 1) {
  const clock = clockAt(data.durationMs, count);
  const figures = [];
  if (data.totalVolumeKg > 0) {
    figures.push({ label: 'VOLUME', value: formatVolume(data.totalVolumeKg * count), unit: 'KG' });
  }
  figures.push({ label: 'TIME', value: clock.value, unit: clock.unit });
  figures.push({ label: 'SETS', value: setsAt(data.setCount, count), unit: '' });
  figures.push({ label: 'EXERCISES', value: String(data.exerciseCount), unit: '' });
  return figures;
}

function layoutGrid(ctx, data) {
  const half = STICKER_WIDTH / 2;
  const cellW = half - GRID.pad * 2;
  const measure = (value) => (px) => {
    font(ctx, { px, weight: 800 });
    return ctx.measureText(value).width;
  };
  let y = 0;
  const headCy = y + GRID.head / 2;
  y += GRID.head;
  const cells = gridFigures(data).map((figure, i) => {
    const big = i < 2;
    const size = big ? GRID.big : GRID.small;
    const px = fitPx(measure(figure.value), cellW - (figure.unit ? 24 : 0), size.px, size.min);
    return { ...figure, px, big };
  });
  const row1 = { top: y, h: GRID.cell };
  y += GRID.cell;
  const row2 = { top: y, h: GRID.cell2 };
  y += GRID.cell2;
  const rowBoxes = data.rows.map(() => {
    const box = { top: y, h: GRID.row };
    y += GRID.row;
    return box;
  });
  y += BOTTOM_PAD;
  return { headCy, cells, row1, row2, rowBoxes, height: y, total: watermarkBottom(y) };
}

function drawGrid(ctx, scale, data, layout, art, reveal) {
  const { headCy, cells, row1, row2, rowBoxes, total } = layout;
  const half = STICKER_WIDTH / 2;
  const left = GRID.pad;
  const right = STICKER_WIDTH - GRID.pad;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // The rules: the box, the head, the two figure rows split down the
  // middle, one under each exercise — the last of those tops the
  // wordmark's cell.
  part(ctx, reveal.rule, 0, () => {
    setShadow(ctx, 'text', scale);
    ctx.strokeStyle = ink(GRID.alpha);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(0.5, 0.5, STICKER_WIDTH - 1, total - 1);
    const across = (y) => {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(STICKER_WIDTH, y + 0.5);
    };
    across(row1.top);
    across(row2.top);
    across(row2.top + row2.h);
    rowBoxes.forEach((box) => across(box.top + box.h));
    ctx.moveTo(half + 0.5, row1.top);
    ctx.lineTo(half + 0.5, row2.top + row2.h);
    ctx.stroke();
  });

  part(ctx, reveal.header, -6, () => {
    setShadow(ctx, 'text', scale);
    font(ctx, { px: GRID.label.px, weight: 800 });
    ctx.fillStyle = '#ffffff';
    drawSpaced(ctx, 'WORKOUT COMPLETE', left, headCy + 0.5, GRID.label.spacing);
    if (data.date) {
      ctx.fillStyle = ink(0.8);
      drawSpaced(ctx, data.date, right, headCy + 0.5, GRID.label.spacing, 'right');
    }
  });

  const count = easeOutCubic(clamp01(reveal.stats));
  const live = gridFigures(data, count);
  cells.forEach((cell, i) => {
    const row = cell.big ? row1 : row2;
    const x = (i % 2) * half + GRID.pad;
    part(ctx, reveal.header, -4, () => {
      setShadow(ctx, 'text', scale);
      font(ctx, { px: GRID.label.px, weight: 800 });
      ctx.fillStyle = ink(0.75);
      drawSpaced(ctx, cell.label, x, row.top + 8 + GRID.label.px / 2, GRID.label.spacing);
    });
    if (reveal.stats <= 0) return;
    ctx.save();
    ctx.globalAlpha *= lerp(0.35, 1, count);
    ctx.textBaseline = 'alphabetic';
    setShadow(ctx, cell.big ? 'big' : 'text', scale);
    font(ctx, { px: cell.px, weight: 800 });
    ctx.fillStyle = '#ffffff';
    const baseline = row.top + row.h - (cell.big ? 10 : 8);
    ctx.fillText(live[i].value, x, baseline);
    if (cell.unit) {
      const w = ctx.measureText(live[i].value).width;
      setShadow(ctx, 'text', scale);
      font(ctx, { px: GRID.unit.px, weight: 800 });
      drawSpaced(ctx, cell.unit, x + w + 5, baseline, GRID.unit.spacing);
    }
    ctx.restore();
  });

  data.rows.forEach((row, i) => {
    part(ctx, reveal.row(i), 6, () => {
      const box = rowBoxes[i];
      setShadow(ctx, 'text', scale);
      font(ctx, { px: GRID.name.px, weight: 700 });
      ctx.fillStyle = '#ffffff';
      ctx.fillText(truncate(ctx, row.name, right - left), left, box.top + box.h / 2 + 0.5);
    });
  });
}

const grid = { mascotStage: null, layout: layoutGrid, draw: drawGrid };

// ── the pulse ──────────────────────────────────────────────────────────
//
// The session as a heartbeat: one line across the whole width, flat
// between the exercises and spiking at each in proportion to the load
// it moved, with the volume (the minutes, for a session that moved
// none) huge over it and cutting through it; the time and the sets in
// a tracked line beneath; the exercises last, small and quiet.
const PULSE = {
  amp: 28,
  lw: 2.5,
  eyebrow: { px: 9, spacing: 2.2 },
  big: { px: 74, min: 40 },
  unit: { px: 11, spacing: 2 },
  line2: { px: 11, spacing: 2.2 },
  row: { px: 9.5, h: 13 },
};

// What an exercise moved, for the height of its spike: reps × load, a
// bodyweight rep counting one.
function setsLoad(sets) {
  return (Array.isArray(sets) ? sets : []).reduce((sum, set) => {
    const load = set?.isBodyweight === true ? Number(set?.addedWeight) || 0 : Number(set?.weight) || 0;
    return sum + (Number(set?.reps) || 0) * (load || 1);
  }, 0);
}

function pulseHero(data, count = 1) {
  if (data.totalVolumeKg > 0) return { value: formatVolume(data.totalVolumeKg * count), unit: 'KG' };
  const clock = clockAt(data.durationMs, count);
  return { value: clock.value, unit: clock.unit };
}

function pulseLine(data, count = 1) {
  const clock = clockAt(data.durationMs, count);
  const sets = `${setsAt(data.setCount, count)} SETS`;
  if (data.totalVolumeKg > 0) return `${clock.value} ${clock.unit} · ${sets}`;
  const n = data.exerciseCount;
  return `${sets} · ${n} EXERCISE${n === 1 ? '' : 'S'}`;
}

function layoutPulse(ctx, data) {
  let y = PAD;
  const eyebrowCy = y + PULSE.eyebrow.px / 2;
  y += PULSE.eyebrow.px + 16;
  const hero = pulseHero(data);
  font(ctx, { px: PULSE.unit.px, weight: 800 });
  const unitW = spacedWidth(ctx, hero.unit, PULSE.unit.spacing) + 8;
  const measure = (px) => {
    font(ctx, { px, weight: 800 });
    return ctx.measureText(hero.value).width;
  };
  const bigPx = fitPx(measure, CONTENT_W - unitW, PULSE.big.px, PULSE.big.min);
  font(ctx, { px: bigPx, weight: 800 });
  const cap = capHeight(ctx);
  const baseline = y + cap;
  const lineY = baseline - cap * 0.3;
  y = Math.max(baseline, lineY + PULSE.amp * 0.5) + 12;
  const line2Cy = y + PULSE.line2.px / 2;
  y += PULSE.line2.px + 14;
  const rowBoxes = data.rows.map(() => {
    const box = { top: y, h: PULSE.row.h };
    y += PULSE.row.h;
    return box;
  });
  y += BOTTOM_PAD;

  // The heartbeat: flat, and a spike per exercise — up by its share of
  // the heaviest exercise's load, then a smaller dip — across the whole
  // width, edge to edge.
  const loads = data.exercises.map((exercise) => setsLoad(exercise?.sets));
  const peak = Math.max(1, ...loads);
  const points = [[0, lineY]];
  loads.forEach((load, i) => {
    const x = (STICKER_WIDTH * (i + 0.5)) / loads.length;
    const h = PULSE.amp * Math.max(0.25, load / peak);
    points.push([x - 12, lineY], [x - 5, lineY - h], [x + 1, lineY + h * 0.45], [x + 7, lineY]);
  });
  points.push([STICKER_WIDTH, lineY]);
  return { eyebrowCy, bigPx, unitW, baseline, points, line2Cy, rowBoxes, height: y };
}

function drawPulse(ctx, scale, data, layout, art, reveal) {
  const { eyebrowCy, bigPx, unitW, baseline, points, line2Cy, rowBoxes } = layout;
  const cx = STICKER_WIDTH / 2;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  part(ctx, reveal.header, -6, () => {
    setShadow(ctx, 'text', scale);
    font(ctx, { px: PULSE.eyebrow.px, weight: 800 });
    ctx.fillStyle = ink(0.85);
    const eyebrow = data.date ? `WORKOUT COMPLETE · ${data.date}` : 'WORKOUT COMPLETE';
    drawSpaced(ctx, eyebrow, cx, eyebrowCy + 0.5, PULSE.eyebrow.spacing, 'center');
  });

  // The line, traced from the left as the figures land.
  const shown = Math.ceil(points.length * clamp01(reveal.rule));
  if (shown > 1) {
    ctx.save();
    setShadow(ctx, 'text', scale);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = PULSE.lw;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    points.slice(0, shown).forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    ctx.restore();
  }

  const count = easeOutCubic(clamp01(reveal.stats));
  if (reveal.stats > 0) {
    const hero = pulseHero(data, count);
    ctx.save();
    ctx.globalAlpha *= lerp(0.35, 1, count);
    ctx.textBaseline = 'alphabetic';
    font(ctx, { px: bigPx, weight: 800 });
    const w = ctx.measureText(hero.value).width;
    const left = cx - (w + unitW) / 2;
    setShadow(ctx, 'big', scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(hero.value, left, baseline);
    setShadow(ctx, 'text', scale);
    font(ctx, { px: PULSE.unit.px, weight: 800 });
    drawSpaced(ctx, hero.unit, left + w + 8, baseline, PULSE.unit.spacing);
    ctx.restore();
  }

  part(ctx, reveal.rule, 4, () => {
    setShadow(ctx, 'text', scale);
    font(ctx, { px: PULSE.line2.px, weight: 700 });
    ctx.fillStyle = ink(0.88);
    drawSpaced(ctx, pulseLine(data, count), cx, line2Cy + 0.5, PULSE.line2.spacing, 'center');
  });

  data.rows.forEach((row, i) => {
    part(ctx, reveal.row(i), 4, () => {
      const box = rowBoxes[i];
      setShadow(ctx, 'text', scale);
      font(ctx, { px: PULSE.row.px, weight: 600 });
      ctx.fillStyle = ink(0.62);
      ctx.textAlign = 'center';
      ctx.fillText(truncate(ctx, row.name, CONTENT_W), cx, box.top + box.h / 2 + 0.5);
      ctx.textAlign = 'left';
    });
  });
}

const pulse = { mascotStage: null, layout: layoutPulse, draw: drawPulse };

const THEMES = { classic, clean, mascot: hero, pyramid, receipt, frame, noir, split, grid, pulse };

// ── the sticker ────────────────────────────────────────────────────────

// Loads what a theme needs and lays it out. Resolves to
//
//   { width, height, rowCount, draw(ctx, scale, reveal = FULL_REVEAL),
//     dispose() }
//
// — width and height being the story's (STICKER_WIDTH × STICKER_HEIGHT).
// `draw` paints onto a context already scaled to design units; `scale`
// is the device pixels per unit that context is at, for the shadows
// (which ignore the transform) and the pictures (rasterised once per
// scale they are drawn at). Call dispose when done, to free those.
//
//   summary              { exercises, durationMs, finishedAt } — the shape
//                          summaryFromWorkout produces (its volume and
//                          record fields are ignored here, on purpose)
//   mascot               'jimmy' | 'gena'
//   equippedAccessories  for the outfit swap
//   theme                one of STICKER_THEMES' ids (default classic)
export async function prepareSticker({
  summary,
  mascot = 'jimmy',
  equippedAccessories = [],
  theme = DEFAULT_STICKER_THEME,
}) {
  const themeId = stickerTheme(theme).id;
  const spec = THEMES[themeId];
  const mascotId = resolveMascotId(mascot);
  // Everything drawn is loaded first — the sprite, the brand mark, the
  // display face — so nothing is exported with a picture still on its
  // way. A mark that fails to load leaves the wordmark to sign alone.
  const [sprite, logo] = await Promise.all([
    spec.mascotStage ? loadSprite(mascotId, spec.mascotStage, equippedAccessories) : null,
    loadImage(LOGO.src),
    spec.fonts ? loadDisplayFont() : null,
  ]);

  const exercises = Array.isArray(summary?.exercises) ? summary.exercises : [];
  const durationMs = Number(summary?.durationMs) || 0;
  const setCount = exercises.reduce((n, e) => n + (Array.isArray(e?.sets) ? e.sets.length : 0), 0);
  const data = {
    // Every exercise, by name, whatever the count — the list is the
    // point. No records passed: the sticker does not mark them.
    rows: buildRows(exercises, [], Infinity),
    // The sessions themselves, for the one theme that draws a shape from
    // them (the pulse) rather than a list.
    exercises,
    exerciseCount: exercises.length,
    durationMs,
    setCount,
    clock: clockAt(durationMs, 1),
    sets: setsAt(setCount, 1),
    date: formatSummaryDate(summary?.finishedAt ?? Date.now()),
    totalVolumeKg: totalVolume(summary, exercises),
    mascotId,
    art: sprite && spec.artDims ? spec.artDims(sprite, { mascotId }) : null,
  };

  const scratch = document.createElement('canvas').getContext('2d');
  const layout = spec.layout(scratch, data);

  // Where the theme's block sits on the story: centred inside the safe
  // margins — scaled down, rarely, when a long session outgrows them —
  // or, for a theme that fills the frame, the whole frame. The brand
  // unit's band goes under the block (watermarkBottom) unless the theme
  // placed the unit itself.
  const blockH = spec.fill ? STICKER_HEIGHT : watermarkBottom(layout.height);
  const fit = spec.fill ? 1 : Math.min(1, (STICKER_HEIGHT - SAFE.top - SAFE.bottom) / blockH);
  const offsetY = spec.fill ? 0 : Math.round((STICKER_HEIGHT - blockH * fit) / 2);
  const watermarkCy = spec.fill ? layout.watermarkCy : layout.height - BOTTOM_PAD + WATERMARK.gap + WATERMARK.mark / 2;

  // The pictures, rasterised per scale they are drawn at (the PNG at 3×,
  // a clip frame at 3× of its fit, the harness at whatever it asks): the
  // mascot's crop, and the brand mark tinted to the theme's ink.
  const crops = new Map();
  const cropFor = (key, make) => {
    let crop = crops.get(key);
    if (!crop) {
      crop = make();
      crops.set(key, crop);
    }
    return crop;
  };
  const artFor = (scale) => {
    if (!sprite || !data.art) return null;
    return cropFor(`art:${Math.round(scale * 1000)}`, () => ({
      canvas: (spec.makeArt ?? makeCrop)(sprite, spec.artCrop ? spec.artCrop(data) : null, data.art, scale),
      ...data.art,
    }));
  };
  const markDims = logo ? logoDims(logo, { height: WATERMARK.mark }) : null;
  const markFor = (scale) => {
    if (!markDims) return null;
    return cropFor(`mark:${Math.round(scale * 1000)}`, () => ({
      canvas: makeTinted(logo, spec.watermark?.color ?? '#ffffff', markDims, scale),
      ...markDims,
    }));
  };

  return {
    width: STICKER_WIDTH,
    height: STICKER_HEIGHT,
    theme: themeId,
    // How many things arrive one after another when drawn with a
    // reveal: the exercise rows for the themes that list them, whatever
    // a theme says otherwise.
    rowCount: spec.beats ? spec.beats(data) : data.rows.length,
    draw: (ctx, scale = STICKER_SCALE, reveal = FULL_REVEAL) => {
      const at = reveal ?? FULL_REVEAL;
      ctx.save();
      ctx.translate(0, offsetY);
      if (fit < 1) {
        ctx.translate(STICKER_WIDTH / 2, 0);
        ctx.scale(fit, fit);
        ctx.translate(-STICKER_WIDTH / 2, 0);
      }
      ctx.save();
      spec.draw(ctx, scale * fit, data, layout, artFor(scale * fit), at);
      ctx.restore();
      // Last, over everything, whatever the theme drew.
      drawWatermark(ctx, scale * fit, watermarkCy, at, spec.watermark, markFor(scale * fit));
      ctx.restore();
    },
    dispose: () => {
      for (const crop of crops.values()) releaseCanvas(crop.canvas);
      crops.clear();
    },
  };
}

// Renders the sticker for a summary and resolves to a canvas whose
// background is fully transparent and whose size is its content's.
//
//   scale                device pixels per design unit; 3 = 960 wide
export async function renderWorkoutStickerCanvas({ scale = STICKER_SCALE, ...options }) {
  const sticker = await prepareSticker(options);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sticker.width * scale);
  canvas.height = Math.round(sticker.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  sticker.draw(ctx, scale);
  sticker.dispose();
  return canvas;
}

// The same, as a PNG File — what the clipboard takes.
// PNG and only PNG: it is the format that keeps the alpha channel.
export async function renderWorkoutStickerFile(options, filename = 'jimmy-the-goat-sticker.png') {
  const canvas = await renderWorkoutStickerCanvas(options);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the sticker.'))), 'image/png');
  }).finally(() => releaseCanvas(canvas));
  return new File([blob], filename, { type: 'image/png' });
}
