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
  //
  // Per stage from the Titan up. Stages 1 and 2 still share the original
  // cut; 3 and 4 are their own, for the reason the tank and the hoodie
  // are — the Legend is not the Goat at a bigger size, and one pair of
  // jeans stretched over all four bodies stops reading as denim that
  // fits. The map form is what `artFor` resolves, and it falls back to
  // stage 1, so a stage with no cut of its own keeps the shared one
  // rather than rendering nothing.
  //
  // 3 and 4 are cut by GEOMETRY, not by a denim colour mask (see the
  // hoodie below for the same technique on a torso piece). Below the
  // waistband every row of the render is [hand][leg][leg][hand] or
  // [leg][leg], so keeping the runs that overlap the middle of the body
  // drops the hands without a threshold; only the shoes the hem falls
  // over need colour, and blue-vs-brown there is unambiguous. Keeping the
  // trouser's own outline rather than its blue pixels is what preserves
  // the tan frayed threads across every rip — a colour mask takes those
  // with the fur — and the flesh behind each rip, which is this exact
  // body's, because per-stage art is only ever drawn on the stage it was
  // cut from (see accessoryArtStageFor).
  'accessory-jeans': {
    slot: 'legs',
    src: {
      1: '/assets/accessories/jeans.png',
      2: '/assets/accessories/jeans.png',
      3: '/assets/accessories/jeans-3.png',
      4: '/assets/accessories/jeans-4.png',
    },
    // Measured off each trimmed file, not guessed: 225×344, 110×179,
    // 127×183. The three cuts genuinely differ in proportion, which is
    // the whole reason `aspect` may be a map.
    aspect: { 1: 0.654, 2: 0.654, 3: 0.615, 4: 0.694 },
    // 1 and 2 keep the numbers the shared cut was tuned to by eye. 3 and
    // 4 are measured: their render and their sprite are the same body in
    // the same pose, so horn-tip-to-sole and the silhouette width
    // register one onto the other (they agree to 0.1% and 1.0%), and the
    // cut's bounding box then gives its size and centre directly. Both
    // land on 1.07 hip-spans wide, which is the landmark doing its job —
    // and is also why the old shared 0.93 left a strip of thigh showing
    // down each side of the Titan.
    fit: {
      anchor: 'hips',
      width: { 1: 0.93, 2: 0.93, 3: 1.075, 4: 1.071 },
      dxW: { 1: 0, 2: 0, 3: 0.002, 4: 0.006 },
      dyH: { 1: 0.204, 2: 0.204, 3: 0.176, 4: 0.195 },
    },
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
  // The Buff's is a THIRD technique, and the one to reach for when a new
  // render arrives: cut by geometry, not by colour. The source is a full
  // character on a transparent canvas, so each row's silhouette already
  // says where the arms are — three runs across a row means arm, torso,
  // arm, and the middle one is the garment. Only the rows where the arms
  // fuse into the shoulders need a colour seam, and there the test has to
  // be read per SIDE: the character is lit from the right, so the
  // garment's shadowed left edge sits near -15 on R-B while its lit right
  // edge sits near +10, and one global threshold cannot sit above the lit
  // cloth and below the shadowed fur at once. Two thresholds do. The
  // per-row edges are then median-filtered, because a garment's edge is a
  // smooth line and every pixel of jitter shows up as a stub of fur.
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
    aspect: { 1: 0.757, 2: 0.535, 3: 0.562, 4: 0.642 },
    // Same story as the tank. The hood is why the centre sits so much
    // closer to the neck on the later cuts: those PNGs include the hooded
    // head, so their centre is higher up the garment.
    //
    // The Buff's three numbers are not eyeballed: the render and the
    // sprite are the same body in the same pose, so horn-tip-to-sole and
    // the silhouette width register one onto the other (they agree to
    // 1.1%), and the cut's own bounding box then gives its width and
    // centre in canvas fractions directly.
    fit: {
      anchor: 'neck',
      widthW: { 1: 0.659, 2: 0.729, 3: 0.666, 4: 0.604 },
      dxW: { 1: 0.008, 2: 0.003, 3: 0.008, 4: -0.022 },
      dyH: { 1: 0.136, 2: 0.052, 3: 0.081, 4: 0.096 },
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
