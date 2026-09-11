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
  'accessory-shades': { slot: 'eyes', src: '/assets/accessories/shades.png', aspect: 2.632 },
  'accessory-headband': { slot: 'head', src: '/assets/accessories/sweatband.png', aspect: 2.609 },
  'accessory-headphones': { slot: 'head', src: '/assets/accessories/headphones.png', aspect: 1.280 },
  'accessory-cap': { slot: 'head', src: '/assets/accessories/cap.png', aspect: 1.389 },
  'accessory-tank': { slot: 'body', src: '/assets/accessories/tank.png', aspect: 0.732 },
  'accessory-hoodie': { slot: 'body', src: '/assets/accessories/hoodie.png', aspect: 0.757 },
  // --- still vector, awaiting art ---
  'accessory-crown': { slot: 'head', viewBox: '0 0 100 62', Art: Crown },
  'accessory-chain': { slot: 'neck', viewBox: '0 0 100 46', Art: Chain },
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
  // The shop card shows stage 1 by default. It is a picture of the ITEM,
  // not of your goat wearing it, so it should not change under you when
  // you evolve — and the tier you happen to be is already on screen.
  const art = artFor(ACCESSORY_ART[itemId], stage);
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
