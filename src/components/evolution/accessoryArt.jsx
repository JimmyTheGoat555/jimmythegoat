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

const GOLD = { light: '#fff3c4', mid: '#f2c14e', deep: '#b8860b', shadow: '#8a6508' };

function GoldDefs({ id }) {
  return (
    <defs>
      <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={GOLD.light} />
        <stop offset="45%" stopColor={GOLD.mid} />
        <stop offset="100%" stopColor={GOLD.deep} />
      </linearGradient>
    </defs>
  );
}

// A crown: five points, a jewelled band, and a highlight along the top
// edge so the gold reads as metal rather than a flat yellow shape.
function Crown({ id }) {
  return (
    <>
      <GoldDefs id={id} />
      <path
        d="M6 46 L6 12 L26 30 L50 4 L74 30 L94 12 L94 46 Z"
        fill={`url(#${id}-gold)`}
        stroke={GOLD.shadow}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <rect x="6" y="44" width="88" height="14" rx="4" fill={`url(#${id}-gold)`} stroke={GOLD.shadow} strokeWidth="3" />
      {/* jewels */}
      <circle cx="50" cy="51" r="4.5" fill="#e8407a" stroke={GOLD.shadow} strokeWidth="1.6" />
      <circle cx="26" cy="51" r="3.4" fill="#3fb6e8" stroke={GOLD.shadow} strokeWidth="1.6" />
      <circle cx="74" cy="51" r="3.4" fill="#3fb6e8" stroke={GOLD.shadow} strokeWidth="1.6" />
      {/* point tips */}
      <circle cx="50" cy="6" r="3.6" fill={GOLD.light} stroke={GOLD.shadow} strokeWidth="1.6" />
      <circle cx="6" cy="12" r="3" fill={GOLD.light} stroke={GOLD.shadow} strokeWidth="1.6" />
      <circle cx="94" cy="12" r="3" fill={GOLD.light} stroke={GOLD.shadow} strokeWidth="1.6" />
    </>
  );
}

// A chunky rope chain: overlapping links following a catenary, heaviest at
// the bottom where a real necklace hangs.
function Chain({ id }) {
  // Links get larger toward the centre of the drape.
  const links = [];
  const N = 13;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const x = 6 + t * 88;
    // parabola: shallow at the ends, deepest in the middle
    const y = 8 + Math.sin(Math.PI * t) * 30;
    const r = 3.4 + Math.sin(Math.PI * t) * 2.2;
    links.push({ x, y, r });
  }
  return (
    <>
      <GoldDefs id={id} />
      {/* the darker under-strand gives the rope some depth */}
      <path
        d="M6 8 Q50 52 94 8"
        fill="none"
        stroke={GOLD.shadow}
        strokeWidth="7"
        strokeLinecap="round"
      />
      {links.map((l, i) => (
        <circle
          key={i}
          cx={l.x}
          cy={l.y}
          r={l.r}
          fill="none"
          stroke={`url(#${id}-gold)`}
          strokeWidth="3.2"
        />
      ))}
    </>
  );
}

// slot + art, one entry per catalog id. Placement lives in JimmyAvatar's
// ACCESSORY_LAYOUT, because it is per-EVOLUTION-STAGE and this file has no
// business knowing which goat it is being drawn on.
export const ACCESSORY_ART = {
  // --- real artwork ---
  'accessory-shades': { slot: 'eyes', src: '/assets/accessories/shades.png', aspect: 2.632 },
  'accessory-headband': { slot: 'head', src: '/assets/accessories/sweatband.png', aspect: 2.609 },
  // Widened from the source art: as drawn, the earcups left a gap of only
  // 15% of the image width, so at any size that put a cup over each of
  // Jimmy's eyes — it is a product shot, with no head between the cups.
  // A 250px 9-slice stretch through the headband's apex (the one column
  // that is solid band all the way down) moves the cups apart without
  // touching either cup or rescaling anything.
  'accessory-headphones': { slot: 'head', src: '/assets/accessories/headphones.png', aspect: 1.348 },
  // Drawn three-quarter-on: the dome sits left of the image's centre and
  // the peak juts out to the right. ACCESSORY_LAYOUT's `left` shifts it so
  // the DOME lands on Jimmy's midline rather than the PNG's.
  'accessory-cap': { slot: 'head', src: '/assets/accessories/cap.png', aspect: 1.765 },
  'accessory-tank': { slot: 'body', src: '/assets/accessories/tank.png', aspect: 0.624 },
  'accessory-hoodie': { slot: 'body', src: '/assets/accessories/hoodie.png', aspect: 0.583 },
  // --- still vector, awaiting art ---
  'accessory-crown': { slot: 'head', viewBox: '0 0 100 62', Art: Crown },
  'accessory-chain': { slot: 'neck', viewBox: '0 0 100 46', Art: Chain },
};

// The same artwork, standalone — for shop cards and anywhere an accessory
// needs showing off the goat. Renders exactly what gets equipped, so the
// thing you buy is unmistakably the thing you wear.
//
// `object-contain` rather than a fixed size: the pieces are wildly
// different shapes (the shades are 2.6:1, the hoodie 0.58:1) and a shop
// card is a square, so letting each one fit itself into the box is the only
// way they all land at a sensible visual weight.
export function AccessoryIcon({ itemId, className = '' }) {
  const art = ACCESSORY_ART[itemId];
  if (!art) return null;

  if (art.src) {
    return <img src={art.src} alt="" aria-hidden="true" className={`object-contain ${className}`} draggable={false} />;
  }

  const { Art } = art;
  return (
    <svg viewBox={art.viewBox} className={`overflow-visible ${className}`} role="img" aria-hidden="true">
      <Art id={`icon-${itemId}`} />
    </svg>
  );
}
