#!/usr/bin/env node
// Puts every character image on the SAME canvas contract, so nothing jumps
// when one image is swapped for another: a tier sprite for the next tier,
// a plain sprite for an outfit set, a sprite for its dance clip.
//
// The contract (the app's, see src/data/avatarAnchors.js GROUND_LINE):
//
//   * the lowest opaque pixel — the feet — sits at GROUND (84%) of the
//     canvas height, on every image, so the pedestal on WorkoutHome and
//     the accessory anchors mean the same thing under all of them;
//   * optionally the body fills a given share of the canvas height
//     (--height, or --match=<sprite> to copy that sprite's), so a clip's
//     standing frame is the same size as the sprite it replaces.
//
// It never changes what the art looks like — only where it sits and, when
// asked, how big it is. Horizontal position is left alone unless --cx is
// given, because every source is already centred to within a pixel.
//
//   node tools/normalize-sprites.mjs public/assets --check
//       Report only: where each image's feet and body box are, and how far
//       off the contract they sit. Nothing is written.
//
//   node tools/normalize-sprites.mjs public/assets/jimmy-legend.png --in-place
//       Shift the feet onto the ground line, same canvas size, same scale.
//
//   node tools/normalize-sprites.mjs public/animations/dances/dance3 \
//       --match=public/assets/jimmy-titan.png --in-place
//       Animated WebP: register the clip's SETTLED frame (its last one,
//       the pose it holds after playing) to the sprite it is drawn over —
//       same ground line, same body height. Every frame is moved and
//       scaled together, so the dance itself is untouched; only where the
//       character stands and how big they are changes. Re-encoded at the
//       pipeline's own quality (--quality, default 74).
//
// Files already within --tolerance pixels (default 1) of the contract are
// left byte-for-byte alone unless --force: a rewrite is a re-download for
// every installed app (the sprites are precached), so it has to earn it.
//
// Needs sharp (devDependency). Reads PNG sprites and animated WebP clips;
// anything else is skipped with a note.

import sharp from 'sharp';
import { mkdir, readdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';

const ALPHA_MIN = 8; // same floor tools/build_gena_outfits.py measures with

const argv = process.argv.slice(2);
const flags = Object.fromEntries(
  argv
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v = 'true'] = a.slice(2).split('=');
      return [k, v];
    }),
);
const inputs = argv.filter((a) => !a.startsWith('--'));

const GROUND = Number(flags.ground ?? 0.84);
const TOLERANCE = Number(flags.tolerance ?? 1);
const QUALITY = Number(flags.quality ?? 74);
const CHECK = flags.check === 'true';
const FORCE = flags.force === 'true';
const IN_PLACE = flags['in-place'] === 'true';
const OUT_DIR = flags.out ?? null;

if (inputs.length === 0) {
  console.error('usage: node tools/normalize-sprites.mjs <file|dir>... [--check] [--in-place|--out=dir] [--ground=0.84] [--height=0.755|--match=sprite.png] [--cx=0.5] [--tolerance=1] [--quality=74] [--force]');
  process.exit(2);
}
if (!CHECK && !IN_PLACE && !OUT_DIR) {
  console.error('refusing to guess where to write: pass --check, --in-place, or --out=<dir>');
  process.exit(2);
}

// ---- measuring ----------------------------------------------------------

// Alpha bounding box of one W×H RGBA page inside a raw buffer.
function bbox(data, width, pageHeight, pageIndex = 0) {
  const start = pageIndex * width * pageHeight * 4;
  let top = -1, bottom = -1, left = width, right = -1;
  for (let y = 0; y < pageHeight; y += 1) {
    const rowStart = start + y * width * 4;
    let rowHas = false;
    for (let x = 0; x < width; x += 1) {
      if (data[rowStart + x * 4 + 3] > ALPHA_MIN) {
        rowHas = true;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    if (rowHas) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  if (top < 0) return null;
  return { top, bottom: bottom + 1, left, right: right + 1 };
}

async function measure(file) {
  const kind = path.extname(file).toLowerCase() === '.webp' ? 'clip' : 'sprite';
  const image = sharp(file, kind === 'clip' ? { animated: true } : {});
  const meta = await image.metadata();
  const pages = kind === 'clip' ? meta.pages ?? 1 : 1;
  const pageHeight = kind === 'clip' ? meta.pageHeight ?? meta.height : meta.height;
  const { data } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const box = bbox(data, meta.width, pageHeight, pages - 1); // the settled frame
  const first = pages > 1 ? bbox(data, meta.width, pageHeight, 0) : box;
  if (!box) throw new Error('no opaque pixels');
  return {
    file, kind, width: meta.width, height: pageHeight, pages,
    loop: meta.loop, delay: meta.delay,
    box, first,
    bottomFrac: box.bottom / pageHeight,
    heightFrac: (box.bottom - box.top) / pageHeight,
    cxFrac: (box.left + box.right) / 2 / meta.width,
  };
}

// ---- the contract ---------------------------------------------------------

let targetHeightFrac = flags.height != null ? Number(flags.height) : null;
let targetCx = flags.cx != null ? Number(flags.cx) : null;
if (flags.match) {
  const m = await measure(flags.match);
  targetHeightFrac = m.heightFrac;
  console.log(`matching ${path.basename(flags.match)}: ground ${(GROUND * 100).toFixed(1)}%, body ${(m.heightFrac * 100).toFixed(2)}% of canvas height`);
}

function plan(m) {
  const scale = targetHeightFrac ? (targetHeightFrac * m.height) / (m.box.bottom - m.box.top) : 1;
  // Scaling happens about the canvas origin, so it moves the feet and the
  // centre; the shifts below put the feet on the ground line and the
  // centre back where it was (or on --cx when asked).
  const cx = (m.box.left + m.box.right) / 2;
  const dy = Math.round(GROUND * m.height - m.box.bottom * scale);
  const dx = Math.round((targetCx != null ? targetCx * m.width : cx) - cx * scale);
  const needed = Math.abs(dy) > TOLERANCE || Math.abs(dx) > TOLERANCE || Math.abs(scale - 1) > 0.002;
  return { scale, dx, dy, needed };
}

// ---- writing --------------------------------------------------------------

async function normalize(m, p, outFile) {
  const opts = m.kind === 'clip' ? { animated: true } : {};
  let buf = await sharp(m.file, opts).toBuffer();
  if (Math.abs(p.scale - 1) > 0.0005) {
    // Resize every page by the same factor. sharp resizes animated images
    // page by page when the target keeps the page proportions.
    const w = Math.round(m.width * p.scale);
    const h = Math.round(m.height * p.scale);
    buf = await sharp(buf, opts).resize({ width: w, height: h, fit: 'fill', kernel: 'lanczos3' }).toBuffer();
  }
  // Scaling about the origin moved the feet to bottom*scale; the shift
  // below is what puts them on the ground line. Pad generously on every
  // side, then cut the original canvas back out at the offset — two passes
  // because sharp applies extract BEFORE extend within one pipeline.
  const pad = Math.abs(p.dx) + Math.abs(p.dy) + Math.ceil(Math.abs(p.scale - 1) * Math.max(m.width, m.height)) + 2;
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  buf = await sharp(buf, opts).extend({ top: pad, bottom: pad, left: pad, right: pad, background: transparent }).toBuffer();
  let out = sharp(buf, opts).extract({ left: pad - p.dx, top: pad - p.dy, width: m.width, height: m.height });
  out = m.kind === 'clip'
    ? out.webp({ quality: QUALITY, effort: 4, loop: m.loop ?? 1, delay: m.delay })
    // Adaptive filtering is what keeps a re-encoded sprite the size of the
    // original (the Legend came out 25% larger without it); these files
    // are precached, so bytes here are bytes on every install.
    : out.png({ compressionLevel: 9, adaptiveFiltering: true });
  const tmp = `${outFile}.tmp-${process.pid}`;
  await out.toFile(tmp);
  await rename(tmp, outFile);
  return measure(outFile);
}

// ---- run ------------------------------------------------------------------

async function expand(p) {
  const s = await stat(p);
  if (!s.isDirectory()) return [p];
  const names = (await readdir(p)).sort();
  const files = [];
  for (const n of names) files.push(...(await expand(path.join(p, n))));
  return files;
}

const files = (await Promise.all(inputs.map(expand))).flat().filter((f) => /\.(png|webp)$/i.test(f));
if (OUT_DIR) await mkdir(OUT_DIR, { recursive: true });

const pct = (v) => `${(v * 100).toFixed(2)}%`;
let changed = 0;
for (const file of files) {
  let m;
  try {
    m = await measure(file);
  } catch (err) {
    console.log(`${path.basename(file)}: skipped (${err.message})`);
    continue;
  }
  const p = plan(m);
  const where = `${m.width}x${m.height}${m.pages > 1 ? `×${m.pages}` : ''}  feet ${pct(m.bottomFrac)}  body ${pct(m.heightFrac)}  cx ${pct(m.cxFrac)}`;
  const fix = `dy ${p.dy >= 0 ? '+' : ''}${p.dy}px${p.dx ? ` dx ${p.dx >= 0 ? '+' : ''}${p.dx}px` : ''}${Math.abs(p.scale - 1) > 0.0005 ? ` scale ×${p.scale.toFixed(4)}` : ''}`;
  if (!p.needed && !FORCE) {
    console.log(`${path.basename(file).padEnd(26)} ${where}  ok`);
    continue;
  }
  if (CHECK) {
    console.log(`${path.basename(file).padEnd(26)} ${where}  needs ${fix}`);
    continue;
  }
  const outFile = IN_PLACE ? file : path.join(OUT_DIR, path.basename(file));
  const after = await normalize(m, p, outFile);
  changed += 1;
  console.log(`${path.basename(file).padEnd(26)} ${where}  ${fix}  →  feet ${pct(after.bottomFrac)} body ${pct(after.heightFrac)} cx ${pct(after.cxFrac)}`);
}
console.log(CHECK ? `checked ${files.length} file(s)` : `wrote ${changed} of ${files.length} file(s)`);
