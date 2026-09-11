// Inline vector art for every accessory, keyed by its catalog id.
//
// Drawn here rather than shipped as PNGs: five small paths cost a couple
// of KB inside a chunk that already loads, stay crisp from a 36px
// leaderboard row to a 400px profile hero, and recolour with the rest of
// the UI instead of needing an export per variant. It also means adding an
// accessory is one catalog line plus one entry here — no asset pipeline.
//
// Each entry owns its own `viewBox` and aspect, because these shapes are
// genuinely different proportions (a sweatband is a sliver, a crown is
// nearly square) and forcing them through one box would squash something.
// `width` is a percentage of the SPRITE's width and `top` a percentage of
// its height — see JimmyAvatar for why those are the units that survive
// the four tiers having different canvas widths.
//
// Coordinates were calibrated against the sprites' alpha channels: horn
// tips begin ~8% down, the forehead sits ~13%, eyes ~17%, and the neck
// pinches ~20% of the body before the shoulders flare.

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

// Aviators: teardrop lenses, thin gold rims, a bridge, and temple arms
// running off toward the ears.
function Shades({ id }) {
  // Bigger glass, thinner rim. The first cut used a 3-unit stroke on a
  // ~42-unit lens, which at avatar scale read as a solid gold blob with a
  // dark speck in it rather than aviators.
  const lens = 'M3 5 H45 Q47.5 5 47.5 9 Q47.5 31 29 35 Q8 37 4.5 18 Q3 9 3 5 Z';
  return (
    <>
      <GoldDefs id={id} />
      <defs>
        <linearGradient id={`${id}-lens`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#4a4f5c" />
          <stop offset="35%" stopColor="#15171d" />
          <stop offset="100%" stopColor="#06070a" />
        </linearGradient>
      </defs>
      {/* temple arms, behind the lenses */}
      <path d="M2 9 L-8 13" stroke={GOLD.mid} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M98 9 L108 13" stroke={GOLD.mid} strokeWidth="3.5" strokeLinecap="round" />
      {/* bridge */}
      <path d="M47 11 Q50 7.5 53 11" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="2.6" strokeLinecap="round" />
      <g transform="translate(0,2)">
        <path d={lens} fill={`url(#${id}-lens)`} stroke={`url(#${id}-gold)`} strokeWidth="1.9" strokeLinejoin="round" />
        <g transform="translate(100,0) scale(-1,1)">
          <path d={lens} fill={`url(#${id}-lens)`} stroke={`url(#${id}-gold)`} strokeWidth="1.9" strokeLinejoin="round" />
        </g>
        {/* specular streak, one per lens */}
        <path d="M10 12 L23 9" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M90 12 L77 9" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2.6" strokeLinecap="round" />
      </g>
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

// A sweatband: a red band with a slight downward curve to sit on a
// forehead, a darker underside, and a stitched highlight line.
function Headband({ id }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-red`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff6b63" />
          <stop offset="45%" stopColor="#e3342f" />
          <stop offset="100%" stopColor="#9b1c17" />
        </linearGradient>
      </defs>
      <path
        d="M3 6 Q50 -2 97 6 L97 20 Q50 28 3 20 Z"
        fill={`url(#${id}-red)`}
        stroke="#6d1210"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M8 11 Q50 4 92 11" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" />
      {/* centre stripe, the classic sports-band detail */}
      <path d="M44 3 Q50 1 56 3 L56 25 Q50 27 44 25 Z" fill="#f8fafc" fillOpacity="0.85" />
    </>
  );
}

// Backwards cap: dome facing us, the strap gap at the front and the peak
// jutting out behind, which is what reads as "worn backwards".
function Cap({ id }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-blue`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6ba8ff" />
          <stop offset="50%" stopColor="#2b6fd6" />
          <stop offset="100%" stopColor="#17407f" />
        </linearGradient>
      </defs>
      {/* peak, poking out behind the head */}
      <path d="M22 30 Q50 20 78 30 Q86 34 78 38 Q50 30 22 38 Q14 34 22 30 Z" fill="#17407f" stroke="#0e2a55" strokeWidth="3" strokeLinejoin="round" />
      {/* crown of the cap */}
      <path
        d="M10 40 Q10 6 50 6 Q90 6 90 40 Z"
        fill={`url(#${id}-blue)`}
        stroke="#0e2a55"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* panel seams */}
      <path d="M50 7 L50 40" stroke="#0e2a55" strokeOpacity="0.55" strokeWidth="2" />
      <path d="M28 12 Q22 26 22 40" fill="none" stroke="#0e2a55" strokeOpacity="0.45" strokeWidth="2" />
      <path d="M72 12 Q78 26 78 40" fill="none" stroke="#0e2a55" strokeOpacity="0.45" strokeWidth="2" />
      {/* adjustable strap band across the front */}
      <rect x="10" y="38" width="80" height="9" rx="3" fill="#0e2a55" />
      <circle cx="50" cy="9" r="3.5" fill="#0e2a55" />
    </>
  );
}

// slot + placement + art, all in one place so adding an accessory is a
// single entry. `top` is the CENTRE of the piece as a % of sprite height.
export const ACCESSORY_ART = {
  'accessory-crown': { slot: 'head', viewBox: '0 0 100 62', width: '44%', top: '7.5%', Art: Crown },
  'accessory-cap': { slot: 'head', viewBox: '0 0 100 50', width: '46%', top: '8%', Art: Cap },
  'accessory-headband': { slot: 'head', viewBox: '0 0 100 26', width: '42%', top: '13.5%', Art: Headband },
  'accessory-shades': { slot: 'eyes', viewBox: '0 0 100 38', width: '38%', top: '17%', Art: Shades },
  'accessory-chain': { slot: 'neck', viewBox: '0 0 100 46', width: '48%', top: '28%', Art: Chain },
};

// The same art, standalone — for shop cards and anywhere an accessory
// needs showing off the goat. Renders exactly what gets equipped, so the
// thing you buy is unmistakably the thing you wear.
export function AccessoryIcon({ itemId, className = '' }) {
  const art = ACCESSORY_ART[itemId];
  if (!art) return null;
  const { Art } = art;
  return (
    <svg viewBox={art.viewBox} className={`overflow-visible ${className}`} role="img" aria-hidden="true">
      <Art id={`icon-${itemId}`} />
    </svg>
  );
}
