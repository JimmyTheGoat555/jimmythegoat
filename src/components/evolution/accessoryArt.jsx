// Where each accessory's artwork comes from, keyed by its catalog id.
//
// Two kinds of entry live here and JimmyAvatar renders both:
//
//   `src`     — a transparent PNG under public/assets/accessories/. The
//               real artwork, drawn by the user. `aspect` is its width÷height
//               measured from the trimmed file, so a caller can reserve the
//               right box without waiting for the image to load.
//   `Art`     — inline SVG, for the pieces that have no PNG yet. A couple of
//               KB inside a chunk that already loads, sharp at any size.
//               These are placeholders; as PNGs arrive they swap over one
//               line at a time.
//
// Every PNG is pre-trimmed to its alpha bounding box (see the note on
// ACCESSORY_LAYOUT in JimmyAvatar) — that is what makes the placement
// percentages mean anything, because an untrimmed export carries however
// much empty canvas the generator happened to leave around the subject.





// slot + art, one entry per catalog id. Placement lives in JimmyAvatar's
// ACCESSORY_LAYOUT, because it is per-EVOLUTION-STAGE and this file has no
// business knowing which goat it is being drawn on.
//
// `src` and `aspect` are EITHER a single value used on every tier, OR a
// {1,2,3,4} map when a piece is drawn per stage. Use the map whenever the
// same garment scaled four ways stops looking like it fits: a hoodie cut
// for the Goat stretched onto the Legend reads as a tarpaulin, because the
// two are not the same body at two sizes. Head and eye pieces rarely need
// it — a cap is a cap — but anything that drapes over a torso does.
// `artFor(art, stage)` resolves whichever form an entry uses.
//
// cap, headphones, tank and hoodie were extracted from the user's Canva
// composites (six JPEGs of stage-1 Jimmy, one per accessory, sharing a
// base render). The bare goat was rebuilt as the per-pixel median of all
// six — at any pixel at most two of them carry an accessory — and each
// garment is what differs from it. See the commit message for the two
// things that made that hard: the exports bake their transparency
// checkerboard into the JPEG, and a grey hoodie on brown fur barely
// differs at all.
//
// None of these carry `behind`. They don't need it: the source goat's
// neck was standing in the collar when the composite was made, so the
// hole it left is genuinely transparent and his neck shows through it.
export const ACCESSORY_ART = {
  'accessory-shades': { slot: 'eyes', src: '/assets/accessories/shades.png', aspect: 3.298 },
  'accessory-headphones': { slot: 'head', src: '/assets/accessories/headphones.png', aspect: 1.280 },
  'accessory-cap': { slot: 'head', src: '/assets/accessories/cap.png', aspect: 1.389 },
  'accessory-jeans': { slot: 'legs', src: '/assets/accessories/jeans.png', aspect: 0.654 },
  // Drawn per stage — the user made a version for each Jimmy, and the
  // Legend's is not the Goat's garment at a bigger size. Stage 1 and 2 came
  // out of folder-of-composites extraction; 3 and 4 from single images,
  // using our own sprite colour-matched on the bare legs as the reference.
  'accessory-tank': {
    slot: 'body',
    src: {
      1: '/assets/accessories/tank-1.png',
      2: '/assets/accessories/tank-2.png',
      3: '/assets/accessories/tank-3.png',
      4: '/assets/accessories/tank-4.png',
    },
    aspect: { 1: 0.732, 2: 0.639, 3: 0.706, 4: 0.732 },
  },
  // All four are their own. They needed two different techniques, and which
  // one wins is not predictable: Canva re-renders the whole character per
  // export, so on the Titan the BARE LEGS differ from our sprite by 28.6
  // after colour-matching while the garment only reaches 32 — no gap to
  // threshold, and subtraction returns the entire goat. Colour separates
  // that one (cloth near 15 on R-B, fur near 41). The Legend is the reverse:
  // his shorts are dark too, so colour grabs them and subtraction is the one
  // that works. Try both on anything new.
  //
  // The Buff's keeps the shadowed face from inside its hood, at the user's
  // request — as on the Legend, it reads as the hood shading him.
  'accessory-hoodie': {
    slot: 'body',
    src: {
      1: '/assets/accessories/hoodie-1.png',
      2: '/assets/accessories/hoodie-2.png',
      3: '/assets/accessories/hoodie-3.png',
      4: '/assets/accessories/hoodie-4.png',
    },
    aspect: { 1: 0.757, 2: 0.476, 3: 0.562, 4: 0.642 },
  },
};

// Resolves an entry's art for one tier. A plain value is used on every
// tier; a {1,2,3,4} map is looked up, falling back to stage 1 so a
// half-finished set (say the Goat's hoodie drawn but not the Titan's)
// degrades to the old behaviour instead of rendering nothing.
export function artFor(art, stage = 1) {
  if (!art) return null;
  const pick = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v[stage] ?? v[1] : v);
  return { ...art, src: pick(art.src), aspect: pick(art.aspect), behind: pick(art.behind) };
}

// The same artwork, standalone — for shop cards and anywhere an accessory
// needs showing off the goat. Renders exactly what gets equipped, so the
// thing you buy is unmistakably the thing you wear.
//
// `object-contain` rather than a fixed size: the pieces are wildly
// different shapes (the shades are 2.6:1, the hoodie 0.58:1) and a shop
// card is a square, so letting each one fit itself into the box is the only
// way they all land at a sensible visual weight.
export function AccessoryIcon({ itemId, className = '', stage = 1 }) {
  // The shop card shows stage 1 by default. It is a picture of the ITEM, not
  // of your goat wearing it, so it should not change under you when you
  // evolve — the tier you happen to be is already on screen elsewhere.
  const art = artFor(ACCESSORY_ART[itemId], stage);
  if (!art?.src) return null;
  return <img src={art.src} alt="" aria-hidden="true" className={`object-contain ${className}`} draggable={false} />;
}
