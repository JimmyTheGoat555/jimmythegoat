import { mascotSpriteFor, resolveMascotId } from '../data/mascots';
import {
  drawSpaced,
  lineBaseline,
  loadImage,
  mix,
  parseColor,
  releaseCanvas,
  rgba,
  rrect,
  spacedWidth,
  truncate,
  withAlpha,
} from './canvas';
import { easeOutBack, easeOutCubic, eased, lerp, phase } from './motion';
import { tierTheme } from './tierTheme';
import {
  formatClockParts,
  formatSetChip,
  formatSetsDigest,
  formatSummaryDate,
  formatVolume,
} from './workoutSummaryFormat';
import {
  INTRO_MS,
  OUTRO_MS,
  ROW_REVEAL_MS,
  STATS_AT,
  STATS_MS,
  STRIKE_MS,
  SUMMARY_HEIGHT,
  SUMMARY_WIDTH,
  buildRows,
  buildSummaryTimeline,
} from './workoutSummaryTimeline';

// The animated card (components/workout/AnimatedWorkoutSummary.jsx),
// painted with the canvas API instead of the DOM.
//
// ── WHY A TWIN ──────────────────────────────────────────────────────────
//
// The card was built to be recorded: fixed size, one clock, no context.
// But a DOM node cannot be drawn into a canvas. The html-to-canvas tricks
// go through an SVG <foreignObject>, and Safari taints any canvas that
// has touched one — after which captureStream() throws. On the iPhone
// this is for, that would be the whole feature. So the card is drawn
// twice: once in JSX for the screen, once here for a recorder (the
// clip it fed was cut; the dev harness still draws it), both from the same numbers, the same
// timeline (workoutSummaryTimeline.js), the same easing (motion.js) and
// the same strings (workoutSummaryFormat.js). What the JSX says in CSS —
// the color-mix tints, the transforms, the shadows — is done by hand
// below, measurement for measurement, so a frame at t = 2,340ms is the
// same picture either way. When the card changes, this changes with it;
// the dev harness (dev/celebration.jsx) puts the two side by side at any
// instant for exactly that.
//
// prepareSummaryScene loads what a frame needs — the sprite, the icon,
// the display font — and hands back a scene: `draw(ctx, elapsedMs,
// scale)` paints that instant onto a context already scaled to design
// units (`scale` is only for the shadows, which ignore the transform).
// An instant past `durationMs` is the finished card, holding.
//
// ── BUDGET ──────────────────────────────────────────────────────────────
//
// A frame has to be painted at 1080×1920 in well under 33ms, on a phone,
// or a recording falls behind its own clock. Blurs
// are what cost: a canvas shadow re-renders whatever it is under into a
// scratch surface and blurs it, and at 3× a 22px glow is 66px. So the
// things that never change are painted once per scale and blitted —
// the card body with its grid and border, and the sprite's glow — and
// the card's own big outer shadow is not drawn at all: it fell on the
// dark screen behind the card, where it was never visible.

const W = SUMMARY_WIDTH;
const H = SUMMARY_HEIGHT;
const PAD = 20;
const RADIUS = 28;
const FOOTER_H = 168;
// The same stage the card shows in its footer.
const CARD_STAGE = 4;

// index.css: the body font, and --font-arcade for the numbers.
const SANS = "-apple-system, 'SF Pro Text', system-ui, 'Segoe UI', Roboto, sans-serif";
const ARCADE = "Anton, 'Arial Narrow', sans-serif";

const WHITE = [255, 255, 255, 1];
const AMBER_300 = [252, 211, 77, 1];
const AMBER_200 = [253, 230, 138, 1];
const TICK_INK = '#07120a';
const white = (a) => `rgba(255,255,255,${a})`;

// ── the card's vertical rhythm, from its Tailwind classes ──
const HEADER_TOP = PAD; // pt-5
const HEADER_H = 25; // the pill: 10px text at 1.5 line-height + py-1 + border
const STATS_TOP = HEADER_TOP + HEADER_H + 24; // mt-6
const STAT_LABEL_H = 15;
const STAT_NUM_PX = 52;
const STAT_UNIT_PX = 15;
const STATS_BOTTOM = STATS_TOP + STAT_LABEL_H + 4 + STAT_NUM_PX; // label, mt-1, leading-none number
const RULE_Y = STATS_BOTTOM + 16; // mt-4
const LIST_TOP = RULE_Y + 1 + 12; // mt-3
const FOOTER_TOP = H - FOOTER_H;
const ROW_H = { roomy: 50, oneLine: 33 };
const ROW_GAP = { roomy: 4, compact: 3 };

function font(ctx, weight, px, family = SANS, style = '') {
  ctx.font = `${style ? `${style} ` : ''}${weight} ${px}px ${family}`;
}

// A CSS radial-gradient(rx ry at cx cy, colour, transparent edge): the
// canvas only draws circles, so the circle is drawn through a squash.
function bloom(ctx, cx, cy, rx, ry, color, edge = 0.7) {
  if (color[3] <= 0 || rx <= 0 || ry <= 0) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, rgba(color));
  g.addColorStop(edge, rgba(color, 0));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

// The faint 24px grid, masked out towards the bottom.
function drawGrid(ctx) {
  const fade = 0.7 * H;
  const peak = 0.5 * 0.07 * 0.9;
  ctx.save();
  ctx.lineWidth = 1;
  const g = ctx.createLinearGradient(0, 0, 0, fade);
  g.addColorStop(0, white(peak));
  g.addColorStop(1, white(0));
  ctx.strokeStyle = g;
  ctx.beginPath();
  for (let x = 0.5; x < W; x += 24) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, fade);
  }
  ctx.stroke();
  for (let y = 0.5; y < fade; y += 24) {
    ctx.strokeStyle = white(peak * (1 - y / fade));
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
}

// The card body, grid and border: painted once per scale.
function buildCardLayer(scale) {
  const c = document.createElement('canvas');
  c.width = Math.round(W * scale);
  c.height = Math.round(H * scale);
  const x = c.getContext('2d');
  x.scale(scale, scale);
  rrect(x, 0, 0, W, H, RADIUS);
  const body = x.createLinearGradient(0, 0, 0, H);
  body.addColorStop(0, '#0d0736');
  body.addColorStop(0.48, '#06021c');
  body.addColorStop(1, '#03010f');
  x.fillStyle = body;
  x.fill();
  rrect(x, 0, 0, W, H, RADIUS);
  x.clip();
  drawGrid(x);
  rrect(x, 0.5, 0.5, W - 1, H - 1, RADIUS - 0.5);
  x.strokeStyle = white(0.09);
  x.lineWidth = 1;
  x.stroke();
  return c;
}

// The sprite's glow on its own, at its full strength, painted once per
// scale: the sprite is drawn with its shadow and then cut back out, so
// what is left is the halo. Per frame it is blitted under the sprite at
// whatever opacity the outro calls for.
const GLOW_BLUR = 22;
const GLOW_MARGIN = 48;
function buildGlowLayer(sprite, spriteW, spriteH, glow, scale) {
  const c = document.createElement('canvas');
  c.width = Math.round((spriteW + GLOW_MARGIN * 2) * scale);
  c.height = Math.round((spriteH + GLOW_MARGIN * 2) * scale);
  const x = c.getContext('2d');
  x.scale(scale, scale);
  x.shadowColor = rgba(glow);
  x.shadowBlur = GLOW_BLUR * scale;
  x.drawImage(sprite, GLOW_MARGIN, GLOW_MARGIN, spriteW, spriteH);
  x.shadowColor = 'rgba(0,0,0,0)';
  x.shadowBlur = 0;
  x.globalCompositeOperation = 'destination-out';
  x.drawImage(sprite, GLOW_MARGIN, GLOW_MARGIN, spriteW, spriteH);
  return c;
}

function drawFrame(ctx, elapsedMs, scale, s) {
  const { accent, glow, rows, timeline, compact, rowTops, sprite, icon } = s;
  const t = Math.max(0, Math.min(timeline.endAt, Number(elapsedMs) || 0));
  // Past the end the card holds, and only the mascot's glow keeps
  // breathing — so the recorder's tail is never a run of identical
  // frames, which a canvas capture is free to skip.
  const hold = Math.max(0, (Number(elapsedMs) || 0) - timeline.endAt);
  const breathe = 1 - 0.12 * (0.5 - 0.5 * Math.cos(hold / 300));

  const intro = eased(t, 0, INTRO_MS);
  const header = eased(t, 120, 380);
  const stats = phase(t, STATS_AT, STATS_MS);
  const count = easeOutCubic(stats);
  const outro = eased(t, timeline.outroAt, OUTRO_MS, easeOutBack);
  const outroLinear = phase(t, timeline.outroAt, OUTRO_MS);

  // Canvas shadows ignore the transform, so they are scaled by hand.
  const shadow = (color, blur, dx = 0, dy = 0) => {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * scale;
    ctx.shadowOffsetX = dx * scale;
    ctx.shadowOffsetY = dy * scale;
  };
  const noShadow = () => shadow('rgba(0,0,0,0)', 0);

  // ── The screen behind the card (WorkoutCelebration's backdrop) ──
  ctx.save();
  noShadow();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#06021c';
  ctx.fillRect(0, 0, W, H);
  bloom(ctx, W / 2, 0, W * 0.6, H * 0.4, withAlpha(glow, glow[3] * 0.5));
  ctx.restore();

  // ── The card: scaled up from 96% and faded in ──
  ctx.save();
  const base = intro;
  ctx.globalAlpha = base;
  const cardScale = lerp(0.96, 1, intro);
  ctx.translate(W / 2, H / 2);
  ctx.scale(cardScale, cardScale);
  ctx.translate(-W / 2, -H / 2);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const layers = s.layersFor(scale);
  ctx.drawImage(layers.card, 0, 0, W, H);
  // Everything from here on stays inside the card, sprite included.
  rrect(ctx, 0, 0, W, H, RADIUS);
  ctx.clip();
  // Ambient light: the tier bloom at the top, brightening as the numbers
  // land.
  bloom(ctx, W / 2, -0.06 * H, 0.7 * W, 0.45 * H, withAlpha(accent, lerp(0.14, 0.3, count)));

  // ── Header: the verdict on the left, the date on the right ──
  ctx.save();
  ctx.globalAlpha = base * header;
  ctx.translate(0, lerp(-6, 0, header));
  font(ctx, 900, 10);
  const checkW = ctx.measureText('✓').width;
  const verdict = 'WORKOUT COMPLETE';
  const verdictW = spacedWidth(ctx, verdict, 2.2) + 2.2;
  const pillW = 1 + 10 + checkW + 6 + verdictW + 10 + 1;
  const pillCy = HEADER_TOP + HEADER_H / 2;
  rrect(ctx, PAD, HEADER_TOP, pillW, HEADER_H, HEADER_H / 2);
  shadow(rgba(glow), lerp(0, 16, outroLinear));
  ctx.fillStyle = rgba(accent, 0.12);
  ctx.fill();
  noShadow();
  ctx.strokeStyle = rgba(accent, 0.45);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = rgba(accent);
  ctx.fillText('✓', PAD + 11, pillCy + 0.5);
  drawSpaced(ctx, verdict, PAD + 11 + checkW + 6, pillCy + 0.5, 2.2);
  font(ctx, 700, 10);
  ctx.fillStyle = white(0.4);
  drawSpaced(ctx, s.date, W - PAD - 2, pillCy + 0.5, 2, 'right');
  ctx.restore();

  // ── The two headline numbers, racing up together ──
  const settle = easeOutCubic(stats);
  const drawStat = (label, value, unit, align) => {
    const x = align === 'right' ? W - PAD : PAD;
    ctx.save();
    font(ctx, 700, 10);
    ctx.fillStyle = white(0.45);
    drawSpaced(ctx, label, align === 'right' ? x - 2.8 : x, STATS_TOP + STAT_LABEL_H / 2 + 0.5, 2.8, align);
    // The number settles from slightly small and soft as the count lands.
    ctx.globalAlpha = base * lerp(0.35, 1, settle);
    const sc = lerp(0.9, 1, settle);
    ctx.translate(x, STATS_BOTTOM);
    ctx.scale(sc, sc);
    ctx.translate(-x, -STATS_BOTTOM);
    ctx.textBaseline = 'alphabetic';
    font(ctx, 400, STAT_NUM_PX, ARCADE);
    const numW = ctx.measureText(value).width;
    const baseline = lineBaseline(ctx, STATS_TOP + STAT_LABEL_H + 4, STAT_NUM_PX);
    font(ctx, 400, STAT_UNIT_PX, ARCADE);
    const unitW = spacedWidth(ctx, unit, 1.8) + 1.8;
    const left = align === 'right' ? x - (numW + 6 + unitW) : x;
    font(ctx, 400, STAT_NUM_PX, ARCADE);
    shadow(rgba(accent, lerp(0.2, 0.55, settle)), lerp(6, 26, settle));
    ctx.fillStyle = '#ffffff';
    ctx.fillText(value, left, baseline);
    noShadow();
    font(ctx, 400, STAT_UNIT_PX, ARCADE);
    ctx.fillStyle = rgba(accent);
    drawSpaced(ctx, unit, left + numW + 6, baseline, 1.8);
    ctx.restore();
  };
  const clock = formatClockParts(s.durationMs * count, { hours: s.durationMs >= 60 * 60 * 1000 });
  drawStat('TIME', clock.value, clock.unit, 'left');
  drawStat('VOLUME', formatVolume(s.totalVolumeKg * count), 'KG', 'right');
  // The divider between them.
  const divTop = STATS_BOTTOM - 12 - 44;
  const div = ctx.createLinearGradient(0, divTop, 0, divTop + 44);
  div.addColorStop(0, white(0));
  div.addColorStop(0.5, white(0.22));
  div.addColorStop(1, white(0));
  ctx.fillStyle = div;
  ctx.fillRect(W / 2 - 0.5, divTop, 1, 44);

  // ── A hairline that draws itself under the stats as they land ──
  const ruleW = (W - PAD * 2) * settle;
  if (ruleW > 0) {
    const rule = ctx.createLinearGradient(PAD, 0, PAD + ruleW, 0);
    rule.addColorStop(0, rgba(accent));
    rule.addColorStop(0.6, white(0.18));
    rule.addColorStop(1, white(0));
    shadow(rgba(glow), 10);
    ctx.fillStyle = rule;
    ctx.fillRect(PAD, RULE_Y, ruleW, 1);
    noShadow();
  }

  // ── The list, crossed off one row at a time ──
  if (rows.length === 0) {
    font(ctx, 400, 14);
    ctx.fillStyle = white(0.4);
    ctx.textAlign = 'center';
    ctx.fillText('Nothing logged.', W / 2, (LIST_TOP + FOOTER_TOP - 8) / 2);
    ctx.textAlign = 'left';
  }
  rows.forEach((row, i) => {
    const beat = timeline.rows[i];
    if (!beat) return;
    const reveal = eased(t, beat.at, ROW_REVEAL_MS);
    if (reveal <= 0) return;
    const oneLine = compact || row.overflow;
    const h = oneLine ? ROW_H.oneLine : ROW_H.roomy;
    const top = rowTops[i];
    const strike = eased(t, beat.strikeAt, STRIKE_MS, easeOutCubic);
    // The tick pops as the line starts to move, overshooting a touch.
    const tick = eased(t, beat.strikeAt, 300, easeOutBack);
    const on = Math.min(1, tick);
    // A wash of accent behind the row while it is being struck.
    const flash = strike > 0 ? 1 - phase(t, beat.strikeAt + STRIKE_MS * 0.6, 520) : 0;
    const struck = strike >= 1;

    ctx.save();
    ctx.globalAlpha = base * reveal;
    ctx.translate(0, lerp(8, 0, reveal));
    rrect(ctx, PAD, top, W - PAD * 2, h, 12);
    ctx.fillStyle = rgba(mix(accent, withAlpha(WHITE, 0.03), 0.12 * flash));
    ctx.fill();

    const cy = top + (oneLine ? 16.5 : 15.25);
    const left = PAD + 10;
    const right = W - PAD - 10;
    // The right-hand things first, so the name knows how much room it has.
    let nameRight = right;
    if (oneLine) {
      const digest = row.digest ?? formatSetsDigest(row.sets);
      font(ctx, 600, 11);
      ctx.fillStyle = rgba(mix(accent, withAlpha(WHITE, 0.55), 0.7 * strike));
      ctx.textAlign = 'right';
      ctx.fillText(digest, right, cy + 0.5);
      ctx.textAlign = 'left';
      nameRight -= ctx.measureText(digest).width + 10;
    }
    if (row.pr) {
      font(ctx, 900, 9);
      const prW = spacedWidth(ctx, 'PR', 1.26) + 1.26;
      const pillWidth = prW + 12;
      const pillH = 17.5;
      const px = nameRight - pillWidth;
      ctx.save();
      ctx.globalAlpha = base * reveal * on;
      const ps = tick > 0 ? lerp(0.8, 1, tick) : 0.8;
      ctx.translate(px + pillWidth / 2, cy);
      ctx.scale(ps, ps);
      ctx.translate(-(px + pillWidth / 2), -cy);
      rrect(ctx, px, cy - pillH / 2, pillWidth, pillH, 6);
      if (tick > 0) shadow('rgba(252,211,77,0.35)', 12);
      ctx.fillStyle = rgba(AMBER_300, 0.15);
      ctx.fill();
      noShadow();
      ctx.strokeStyle = rgba(AMBER_300, 0.5);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = rgba(AMBER_200);
      drawSpaced(ctx, 'PR', px + 6, cy + 0.5, 1.26);
      ctx.restore();
      nameRight -= pillWidth + 10;
    }

    // The check circle: an empty ring until its beat, then filled.
    const size = oneLine ? 16 : 18;
    const ccx = left + size / 2;
    ctx.save();
    const cs = tick > 0 ? lerp(0.7, 1, tick) : 1;
    ctx.translate(ccx, cy);
    ctx.scale(cs, cs);
    ctx.translate(-ccx, -cy);
    ctx.beginPath();
    ctx.arc(ccx, cy, size / 2 - 0.75, 0, Math.PI * 2);
    if (on > 0) {
      shadow(rgba(glow), 10 * on);
      ctx.fillStyle = rgba(accent, on);
      ctx.fill();
      noShadow();
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = struck || tick > 0 ? rgba(accent) : white(0.22);
    ctx.stroke();
    if (on > 0) {
      // The tick mark: a 12-unit path in a 10px box.
      const k = 10 / 12;
      const ox = ccx - 5;
      const oy = cy - 5;
      ctx.globalAlpha = base * reveal * Math.min(1, tick * 1.4);
      ctx.beginPath();
      ctx.moveTo(ox + 2.2 * k, oy + 6.3 * k);
      ctx.lineTo(ox + 4.9 * k, oy + 9 * k);
      ctx.lineTo(ox + 9.8 * k, oy + 3.4 * k);
      ctx.strokeStyle = TICK_INK;
      ctx.lineWidth = 2 * k;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.restore();

    // The name, and the strike-through grown over it from the left.
    const nameX = left + size + 10;
    ctx.font = `${row.overflow ? 'italic ' : ''}600 ${oneLine ? 13 : 15}px ${SANS}`;
    ctx.fillStyle = white(lerp(0.96, 0.42, strike));
    ctx.fillText(truncate(ctx, row.name, Math.max(0, nameRight - nameX)), nameX, cy + 0.5);
    if (strike > 0) {
      rrect(ctx, nameX, cy - 1, (nameRight - nameX) * strike, 2, 1);
      shadow(rgba(glow), lerp(10, 4, strike));
      ctx.fillStyle = rgba(accent);
      ctx.fill();
      noShadow();
    }

    // A roomy row lists every set as a chip underneath, tinting to the
    // accent as the row is struck.
    if (!oneLine) {
      const chips = row.sets.slice(0, 6);
      const extra = row.sets.length - chips.length;
      const chipCy = top + 37.75;
      let x = left + 28;
      font(ctx, 700, 10.5);
      const bg = rgba(mix(accent, withAlpha(WHITE, 0.06), 0.18 * strike));
      const fg = rgba(mix(accent, withAlpha(WHITE, 0.7), 0.85 * strike));
      for (const set of chips) {
        const label = formatSetChip(set);
        const w = ctx.measureText(label).width + 12;
        rrect(ctx, x, chipCy - 8.25, w, 16.5, 6);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.fillStyle = fg;
        ctx.fillText(label, x + 6, chipCy + 0.5);
        x += w + 4;
      }
      if (extra > 0) {
        font(ctx, 700, 10);
        ctx.fillStyle = white(0.4);
        ctx.fillText(`+${extra}`, x, chipCy + 0.5);
      }
    }
    ctx.restore();
  });

  // ── Footer: the mascot's spot, and the app's name ──
  bloom(ctx, 0.24 * W, H, 0.6 * W, 0.7 * FOOTER_H, withAlpha(accent, lerp(0.12, 0.34, outroLinear)));
  if (sprite) {
    // Drawn taller than the zone and clipped by the card: a bust. The
    // glow under it strengthens through the outro.
    const sh = s.spriteHeight;
    const sw = s.spriteWidth;
    const sx = 12;
    const sy = FOOTER_TOP + 4;
    ctx.save();
    const ss = lerp(0.97, 1, outro);
    const ox = sx + sw / 2;
    ctx.translate(ox, sy + lerp(10, 0, outro));
    ctx.scale(ss, ss);
    ctx.translate(-ox, -sy);
    ctx.globalAlpha = base * lerp(0.35, 1, outroLinear) * breathe;
    ctx.drawImage(layers.glow, sx - GLOW_MARGIN, sy - GLOW_MARGIN, sw + GLOW_MARGIN * 2, sh + GLOW_MARGIN * 2);
    ctx.globalAlpha = base * lerp(0.85, 1, outroLinear);
    ctx.drawImage(sprite, sx, sy, sw, sh);
    ctx.restore();
  }

  // "17 SETS · 1 PR", arriving with the outro.
  ctx.save();
  ctx.globalAlpha = base * outroLinear;
  ctx.translate(0, lerp(6, 0, outro));
  font(ctx, 700, 10);
  const setsText = `${s.setCount} SET${s.setCount === 1 ? '' : 'S'}`;
  const parts =
    s.prCount > 0
      ? [
          [setsText, white(0.55)],
          [' · ', white(0.55)],
          [`${s.prCount} PR${s.prCount === 1 ? '' : 'S'}`, rgba(AMBER_300)],
        ]
      : [[setsText, white(0.55)]];
  const widths = parts.map(([text]) => spacedWidth(ctx, text, 2.4) + 2.4);
  let px = W - PAD - widths.reduce((a, b) => a + b, 0);
  const lineCy = H - PAD - 28 - 8 - 7.5;
  parts.forEach(([text, color], i) => {
    ctx.fillStyle = color;
    drawSpaced(ctx, text, px, lineCy + 0.5, 2.4);
    px += widths[i];
  });
  ctx.restore();

  // The icon and the wordmark.
  const markCy = H - PAD - 14;
  ctx.font = `italic 400 19px ${ARCADE}`;
  const mark = 'JIMMY THE GOAT';
  const markW = spacedWidth(ctx, mark, 0.475) + 0.475;
  const markX = W - PAD - markW;
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  drawSpaced(ctx, mark, markX + 2, markCy + 2.5, 0.475);
  ctx.fillStyle = '#ffffff';
  drawSpaced(ctx, mark, markX, markCy + 0.5, 0.475);
  if (icon) {
    const ix = markX - 8 - 28;
    const iy = markCy - 14;
    ctx.save();
    rrect(ctx, ix, iy, 28, 28, 8);
    shadow('rgba(0,0,0,0.5)', 12, 0, 4);
    ctx.fillStyle = '#000000';
    ctx.fill();
    noShadow();
    ctx.clip();
    ctx.drawImage(icon, ix, iy, 28, 28);
    ctx.restore();
    rrect(ctx, ix - 0.5, iy - 0.5, 29, 29, 8.5);
    ctx.strokeStyle = white(0.15);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

async function loadFonts() {
  if (typeof document === 'undefined' || typeof document.fonts?.load !== 'function') return;
  await Promise.all([document.fonts.load(`${STAT_NUM_PX}px Anton`), document.fonts.load('italic 19px Anton')]).catch(
    () => null,
  );
}

// Everything a frame needs, loaded once.
//
//   summary              { exercises, durationMs, totalVolumeKg,
//                          personalRecords, finishedAt } — what
//                          WorkoutCelebration holds
//   mascot               'jimmy' | 'gena'
//   equippedAccessories  for the outfit swap
//   tier                 { accent, glow } — the CSS colours in force on
//                          the screen (tierColorsAt in tierTheme.js)
//
// Resolves to { width, height, durationMs, draw(ctx, elapsedMs, scale),
// dispose() } — call dispose when the scene is finished with, to free
// the layers it painted (canvas.js on why that is not left to the GC).
export async function prepareSummaryScene({ summary, mascot = 'jimmy', equippedAccessories = [], tier = {} }) {
  const goat = tierTheme('goat');
  const accent = parseColor(tier.accent) ?? parseColor(goat.accent);
  const glow = parseColor(tier.glow) ?? withAlpha(accent, 0.55);
  const mascotId = resolveMascotId(mascot);
  const [sprite, icon] = await Promise.all([
    loadImage(mascotSpriteFor(mascotId, CARD_STAGE, equippedAccessories)).then(
      (img) => img ?? loadImage(mascotSpriteFor(mascotId, CARD_STAGE)),
    ),
    loadImage('/newlogo.zozo.png'),
    loadFonts(),
  ]);

  const exercises = Array.isArray(summary?.exercises) ? summary.exercises : [];
  const personalRecords = Array.isArray(summary?.personalRecords) ? summary.personalRecords : [];
  const rows = buildRows(exercises, personalRecords);
  const timeline = buildSummaryTimeline(exercises);
  const compact = timeline.compact;
  const gap = compact ? ROW_GAP.compact : ROW_GAP.roomy;
  let y = LIST_TOP;
  const rowTops = rows.map((row) => {
    const top = y;
    y += (compact || row.overflow ? ROW_H.oneLine : ROW_H.roomy) + gap;
    return top;
  });
  const stampedAt = summary?.finishedAt ? Date.parse(summary.finishedAt) : Date.now();
  const spriteHeight = mascotId === 'gena' ? 370 : 320;
  const spriteWidth = sprite
    ? spriteHeight * ((sprite.naturalWidth || sprite.width) / (sprite.naturalHeight || sprite.height))
    : 0;
  // The pre-painted layers, per scale (the harness draws at 2×, the
  // recorder at 3×).
  const layerCache = new Map();
  const layersFor = (scale) => {
    let layers = layerCache.get(scale);
    if (!layers) {
      layers = {
        card: buildCardLayer(scale),
        glow: sprite ? buildGlowLayer(sprite, spriteWidth, spriteHeight, glow, scale) : null,
      };
      layerCache.set(scale, layers);
    }
    return layers;
  };

  const scene = {
    accent,
    glow,
    rows,
    timeline,
    compact,
    rowTops,
    sprite,
    spriteHeight,
    spriteWidth,
    layersFor,
    icon,
    durationMs: Number(summary?.durationMs) || 0,
    totalVolumeKg: Number(summary?.totalVolumeKg) || 0,
    setCount: exercises.reduce((n, e) => n + (Array.isArray(e?.sets) ? e.sets.length : 0), 0),
    prCount: new Set(personalRecords.map((r) => r.name)).size,
    date: formatSummaryDate(Number.isFinite(stampedAt) ? stampedAt : Date.now()),
  };
  return {
    width: W,
    height: H,
    durationMs: timeline.endAt,
    draw: (ctx, elapsedMs, scale = 1) => drawFrame(ctx, elapsedMs, scale, scene),
    dispose: () => {
      for (const layers of layerCache.values()) {
        releaseCanvas(layers.card);
        releaseCanvas(layers.glow);
      }
      layerCache.clear();
    },
  };
}
