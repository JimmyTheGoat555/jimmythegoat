// Pads Gena's four sprites onto a 1080x1920 (9:16) green-screen canvas for
// AI video generators that reject the native 285x1024.
//
// Run:  node tools/pad-for-video.mjs
//       node tools/pad-for-video.mjs --margin=40 --color='#FF00FF' --matte=soft
//
// Needs sharp:  npm install --save-dev sharp
//
// ── THREE THINGS THIS DOES THAT A PLAIN PAD DOES NOT ────────────────────
//
// 1. TRIMS THE DEAD SPACE FIRST. The sprites are 285x1024, but Gena only
//    occupies y=87..860 — that gap is the app's sprite contract (ground
//    line at 84% of canvas height, top of head at 8.5%) which lets one set
//    of accessory coordinates serve a 36px leaderboard row and a 208px
//    hero. It means the canvas is NOT centred on her: 87px above her head,
//    164px below her feet. Padding the raw canvas centres that asymmetry,
//    putting her visibly high in frame with dead green under her feet.
//    So we measure where she actually is and centre THAT.
//
// 2. ONE SHARED CROP FOR ALL FOUR. The union of the four bounding boxes is
//    applied to every frame, rather than each being trimmed to its own.
//    Her silhouette widens as she evolves (246px at stage 1, 269px at
//    stage 2), so per-file trimming would rescale each stage slightly and
//    she would jump in size between them. A shared box keeps the four
//    registered to each other — same scale, same eyeline — which is what
//    you want if the clips are ever cut together or cross-faded.
//
// 3. HARDENS THE ALPHA BEFORE COMPOSITING. 4-5% of each sprite is partial
//    alpha (soft antialiased edges; gena-buff is the worst at 5.49%,
//    because that one's transparency was reconstructed with a feather
//    rather than exported clean). Composite that straight onto #00FF00 and
//    every one of those pixels blends toward green — a green fringe baked
//    into the subject, which is precisely what a chroma key cannot remove
//    later. Thresholding alpha first means every pixel is either fully
//    Gena or fully green, and the key comes out clean.
//
//    --matte=soft skips this and keeps the smooth edge. Use it only if
//    you are NOT keying (e.g. the green is just a backdrop you keep).
//
// Output goes OUTSIDE public/ on purpose: everything under public/assets
// is precached by the PWA service worker, so dropping four 1080x1920 PNGs
// there would add them to the download every app user pays for.

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SRC_DIR = 'public/assets';
const STAGES = [
  { file: 'gena-goat.png', stage: 1 },
  { file: 'gena-buff.png', stage: 2 },
  { file: 'gena-titan.png', stage: 3 },
  { file: 'gena-legend.png', stage: 4 },
];

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);

const OUT_W = Number(argv.width ?? 1080);
const OUT_H = Number(argv.height ?? 1920);
// Breathing room so she is not flush against the frame edge — generators
// tend to crop a little, and a subject welded to the border has nowhere to
// move. Set --margin=0 for edge-to-edge.
const MARGIN = Number(argv.margin ?? 80);
const COLOR = String(argv.color ?? '#00FF00');
const MATTE = String(argv.matte ?? 'hard');
const ALPHA_CUT = Number(argv.threshold ?? 128);
const TRIM = argv.trim !== 'false';
const OUT_DIR = String(argv.out ?? 'video-src/gena');

function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`--color must be a 6-digit hex like #00FF00, got "${hex}"`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, alpha: 1 };
}

// Tightest box containing any pixel above the alpha cut-off. Done by hand
// rather than with sharp's .trim() because .trim() keys off the corner
// pixel's colour, which on a fully transparent corner is not meaningful.
async function alphaBounds(file, cut) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] >= cut) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error(`${file} is fully transparent above alpha ${cut}`);
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

// Every pixel becomes fully opaque or fully clear. Because the feather
// ramps outward, cutting at the midpoint also chokes the matte inward by
// roughly half the feather — which is exactly what keeps green out of the
// edge. RGB is left alone; it is irrelevant wherever alpha lands on 0.
function hardenAlpha(data, channels) {
  let changed = 0;
  for (let i = 3; i < data.length; i += channels) {
    const a = data[i];
    if (a === 0 || a === 255) continue;
    data[i] = a >= ALPHA_CUT ? 255 : 0;
    changed += 1;
  }
  return changed;
}

async function main() {
  const bg = parseHex(COLOR);
  const boxW = OUT_W - MARGIN * 2;
  const boxH = OUT_H - MARGIN * 2;
  if (boxW <= 0 || boxH <= 0) throw new Error(`--margin=${MARGIN} leaves no room in ${OUT_W}x${OUT_H}`);

  const sources = STAGES.map((s) => ({ ...s, path: path.join(SRC_DIR, s.file) }));

  // One crop for all four — see note 2 up top.
  let crop = null;
  if (TRIM) {
    const boxes = await Promise.all(sources.map((s) => alphaBounds(s.path, ALPHA_CUT)));
    const left = Math.min(...boxes.map((b) => b.left));
    const top = Math.min(...boxes.map((b) => b.top));
    const right = Math.max(...boxes.map((b) => b.left + b.width));
    const bottom = Math.max(...boxes.map((b) => b.top + b.height));
    crop = { left, top, width: right - left, height: bottom - top };
    console.log(`shared crop: ${crop.width}x${crop.height} at (${crop.left},${crop.top})`);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const manifest = [];

  for (const src of sources) {
    let pipe = sharp(src.path).ensureAlpha();
    if (crop) pipe = pipe.extract(crop);

    // fit:'inside' never crops and never stretches — it scales until the
    // first axis touches the box. These sprites are far taller than wide,
    // so height binds on all four, which is what keeps the shared scale.
    pipe = pipe.resize({ width: boxW, height: boxH, fit: 'inside', kernel: 'lanczos3' });

    const { data, info } = await pipe.raw().toBuffer({ resolveWithObject: true });
    let hardened = 0;
    if (MATTE === 'hard') hardened = hardenAlpha(data, info.channels);

    const left = Math.round((OUT_W - info.width) / 2);
    const top = Math.round((OUT_H - info.height) / 2);

    const outName = src.file.replace(/\.png$/, `-${OUT_W}x${OUT_H}.png`);
    const outPath = path.join(OUT_DIR, outName);

    await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
      // flatten first: composites Gena onto the key colour and drops the
      // alpha channel, so the file has no transparency left to confuse a
      // generator that ignores it.
      .flatten({ background: bg })
      .extend({ top, bottom: OUT_H - info.height - top, left, right: OUT_W - info.width - left, background: bg })
      .png({ compressionLevel: 9 })
      .toFile(outPath);

    const entry = {
      stage: src.stage,
      source: src.path,
      output: outPath,
      subject: { width: info.width, height: info.height, left, top },
      scale: Number((info.height / (crop ? crop.height : 1024)).toFixed(4)),
      hardenedPixels: hardened,
    };
    manifest.push(entry);
    console.log(
      `stage ${src.stage}  ${src.file.padEnd(18)} -> ${info.width}x${info.height} at (${left},${top})` +
        (MATTE === 'hard' ? `  hardened ${hardened} edge px` : '  soft matte'),
    );
  }

  // Written so the mapping back to sprite coordinates is recoverable — you
  // will want it if a generated clip ever has to line up with the in-app
  // avatar again.
  await writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    `${JSON.stringify({ canvas: { width: OUT_W, height: OUT_H }, margin: MARGIN, color: COLOR, matte: MATTE, crop, frames: manifest }, null, 2)}\n`,
  );
  console.log(`\n${manifest.length} frames + manifest.json written to ${OUT_DIR}/`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
