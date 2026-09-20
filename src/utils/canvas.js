// Canvas helpers shared by everything that paints a workout with the 2D
// API — the transparent sticker (workoutSticker.js) and the animated
// card's canvas twin (workoutSummaryScene.js). Nothing here knows what a
// workout is; it is text, shapes and colour.

export function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Letter-spaced text, a glyph at a time: ctx.letterSpacing is not on
// every browser this runs on, and the tracking is what makes the small
// caps labels read as labels.
export function spacedWidth(ctx, text, spacing) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return Math.max(0, w - spacing);
}

export function drawSpaced(ctx, text, x, y, spacing, align = 'left') {
  const total = spacedWidth(ctx, text, spacing);
  let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = prevAlign;
  return total;
}

export function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

// A rounded-rectangle path, not filled or stroked: ctx.roundRect is too
// new for every phone this runs on.
export function rrect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

// Where CSS puts the baseline of one line of the current font in a line
// box `lineHeight` tall whose top is at `top`: the font's ascent and
// descent, centred in the box. A plain ratio where the browser does not
// report font metrics.
export function lineBaseline(ctx, top, lineHeight) {
  const m = ctx.measureText('Hg');
  const ascent = m.fontBoundingBoxAscent;
  const descent = m.fontBoundingBoxDescent;
  if (Number.isFinite(ascent) && Number.isFinite(descent) && ascent + descent > 0) {
    return top + (lineHeight - (ascent + descent)) / 2 + ascent;
  }
  return top + lineHeight / 2 + (parseFloat(ctx.font) || 16) * 0.35;
}

// ── colour ─────────────────────────────────────────────────────────────
//
// Colours are [r, g, b, a] tuples here so they can be mixed the way
// CSS color-mix(in srgb, …) mixes them. The card leans on color-mix for
// every accent tint, and the canvas has nothing of the kind.

export function parseColor(input) {
  if (Array.isArray(input)) return input;
  const s = String(input ?? '').trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let hex = m[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = parseInt(hex, 16);
    const hasAlpha = hex.length === 8;
    const shift = hasAlpha ? 8 : 0;
    return [(n >>> (16 + shift)) & 255, (n >>> (8 + shift)) & 255, (n >>> shift) & 255, hasAlpha ? (n & 255) / 255 : 1];
  }
  m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i.exec(s);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  }
  if (s === 'transparent') return [0, 0, 0, 0];
  return null;
}

export function rgba(color, alpha = color[3]) {
  return `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
}

export function withAlpha(color, alpha) {
  return [color[0], color[1], color[2], alpha];
}

// color-mix(in srgb, a p, b 1−p). Premultiplied, like CSS: mixing with
// transparent thins a colour rather than dragging it towards black.
export function mix(a, b, p) {
  const q = 1 - p;
  const alpha = a[3] * p + b[3] * q;
  if (alpha <= 0) return [0, 0, 0, 0];
  const ch = (i) => (a[i] * a[3] * p + b[i] * b[3] * q) / alpha;
  return [ch(0), ch(1), ch(2), alpha];
}

// Frees a canvas's backing store now rather than whenever the GC gets
// to it. iOS keeps every canvas's pixels alive until the element is
// collected and caps the total it will hold; a 1080×1920 canvas is
// 8 MB, and a few of them left to the collector is how a page starts
// failing to create the next one. Zero size, zero store.
export function releaseCanvas(canvas) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}
