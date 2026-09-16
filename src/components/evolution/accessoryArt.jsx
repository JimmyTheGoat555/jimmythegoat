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





// slot + art + fit, one entry per catalog id.
//
// `fit` is how the piece sits on a BODY, not where it sits on a canvas:
// which landmark it hangs off (data/avatarAnchors.js — eyes, head, neck,
// hips) and its size and offsets in that landmark's own unit. A pair of
// shades is 2.29 pupil spans wide and centred on the eye line, whoever is
// wearing them; the anchors say where that mascot's eyes are, at that
// tier, in that outfit. AccessoryLayer multiplies the two
// (placeOnAnchors), which is what lets one fit serve Jimmy's four bodies
// and Gena's — and any sprite added later, once its landmarks are in.
//
//   width  × the landmark's span/width          → the piece's width
//   dx     × the landmark's span/width          → horizontal offset
//   dy     × the landmark's span/width, × aspect → vertical offset
//   widthW / dxW: fractions of canvas WIDTH; dyH: of canvas HEIGHT —
//          absolute forms, for the per-stage garments below; any may be
//          a {1,2,3,4} map when the four cuts genuinely differ.
//
// The numbers were derived from the per-tier placements this replaced,
// which were themselves measured off the sprites and corrected by eye —
// so every piece lands where it did before, now by rule.
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
  // Across the eyes: 2.29 pupil spans wide, centred a hair below the eye
  // line so the bridge sits on the nose rather than the brow.
  'accessory-shades': {
    slot: 'eyes',
    src: '/assets/accessories/shades.png',
    aspect: 3.298,
    fit: { anchor: 'eyes', width: 2.29, dy: 0.02 },
  },
  // Head-hugging, so sized by the HEAD, not the eyes: cups 1.28× the head
  // width, straddling the face edge over the ear roots. The art is not
  // centred on what it lines up with — the cups sit at 67% of the PNG's
  // height with the band arcing above — so the centre lands 0.32 head
  // widths below the crown, which puts the band top just over the skull.
  'accessory-headphones': {
    slot: 'head',
    src: '/assets/accessories/headphones.png',
    aspect: 1.28,
    fit: { anchor: 'head', width: 1.28, dy: 0.32 },
  },
  // 0.78 head widths across, its band 0.11 head widths below the crown —
  // drawn three-quarter-on, so the dome reads centred while the peak
  // hangs to one side.
  'accessory-cap': {
    slot: 'head',
    src: '/assets/accessories/cap.png',
    aspect: 1.389,
    fit: { anchor: 'head', width: 0.776, dy: 0.113 },
  },
  // 93% of the leg span, centred 20.4% of canvas height below the hip
  // line — an absolute vertical because the hip-to-sole run is the same
  // share of every sprite (hips 45%, ground 84%), so the garment's
  // vertical extent is fixed by the contract rather than by a landmark.
  'accessory-jeans': {
    slot: 'legs',
    src: '/assets/accessories/jeans.png',
    aspect: 0.654,
    fit: { anchor: 'hips', width: 0.93, dyH: 0.204 },
  },
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
    // Four different cuts of four different Jimmys, so the size and the
    // offset from the neck base are per cut, in absolute canvas units —
    // measured from each stage's own composite, not scaled from stage 1.
    fit: {
      anchor: 'neck',
      widthW: { 1: 0.547, 2: 0.47, 3: 0.507, 4: 0.483 },
      dxW: { 1: 0.008, 2: 0.001, 3: 0.014, 4: -0.009 },
      dyH: { 1: 0.147, 2: 0.125, 3: 0.131, 4: 0.142 },
    },
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
    // Same story as the tank. The hood is why the centre sits so much
    // closer to the neck on the later cuts: those PNGs include the hooded
    // head, so their centre is higher up the garment.
    fit: {
      anchor: 'neck',
      widthW: { 1: 0.659, 2: 0.5, 3: 0.666, 4: 0.604 },
      dxW: { 1: 0.008, 2: 0.001, 3: 0.008, 4: -0.022 },
      dyH: { 1: 0.136, 2: 0.065, 3: 0.081, 4: 0.096 },
    },
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
