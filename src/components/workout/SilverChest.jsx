// The Silver Lootbox's chest art. Inline SVG rather than the stack of
// gradient <div>s this started as: the old version was two rounded
// rectangles seen straight-on, which is why it read as flat no matter how
// much gloss went on it. Depth here comes from actually drawing three
// faces of a box — front, receding top, receding right — on a consistent
// projection (everything behind is offset by +16x / -12y), so the lid, the
// body and the trim all agree about where the light and the vanishing
// point are.
//
// Styling notes, in the chunky mobile-game idiom the brief asked for:
//   • one heavy dark outline colour on every shape, never a lighter
//     per-shape stroke — that single contour is what makes this sort of
//     art pop against a dark background
//   • flat-ish banded gradients instead of smooth photoreal ones
//   • gold trim + rivets to break up the silver, and a lock as the focal
//     point at the centre of the front face
//   • the lid is its own <g> so the burst can hinge it off the back edge
//
// `stage` drives the whole thing (see SilverLootboxModal): closed →
// shaking → burst → revealed.

const OUTLINE = '#1b1f2b';
const STROKE = 3.2;

// Back-face offset. Every receding edge in here uses exactly this, which
// is the entire trick behind the box reading as solid.
const DX = 16;
const DY = -12;

export default function SilverChest({ stage = 'closed', className = '' }) {
  const open = stage === 'burst' || stage === 'revealed';

  return (
    <svg
      viewBox="0 0 220 210"
      className={className}
      role="img"
      aria-label="A silver treasure chest"
    >
      <defs>
        {/* Front face: brightest just under the top edge, falling off to a
            shadowed base — a lit box, not a gradient swatch. */}
        <linearGradient id="chestFront" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbfcff" />
          <stop offset="18%" stopColor="#dde2ee" />
          <stop offset="55%" stopColor="#aab2c4" />
          <stop offset="100%" stopColor="#767e91" />
        </linearGradient>
        {/* Top face catches the most light, so it's the lightest plane. */}
        <linearGradient id="chestTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#e4e9f3" />
          <stop offset="100%" stopColor="#c2c9d8" />
        </linearGradient>
        {/* Right face turns away from the light — the darkest plane, which
            is what sells the corner. */}
        <linearGradient id="chestSide" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#98a0b1" />
          <stop offset="100%" stopColor="#5c6474" />
        </linearGradient>
        <linearGradient id="goldFace" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff6d0" />
          <stop offset="35%" stopColor="#f7cf5e" />
          <stop offset="70%" stopColor="#d79f25" />
          <stop offset="100%" stopColor="#9a6b12" />
        </linearGradient>
        <linearGradient id="goldTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fffbe8" />
          <stop offset="100%" stopColor="#e8b73c" />
        </linearGradient>
        <radialGradient id="innerGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fff8d6" stopOpacity="1" />
          <stop offset="55%" stopColor="#ffd76a" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#ffb020" stopOpacity="0" />
        </radialGradient>
        {/* Rays have to FADE toward their tips. Flat-filled wedges just
            read as a grey spiky badge behind the box — the falloff is the
            whole difference between "light" and "triangle". */}
        <radialGradient id="rayFade" cx="110" cy="104" r="118" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffe9a8" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#ffd76a" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ffc23d" stopOpacity="0" />
        </radialGradient>
        {/* The travelling specular bar. Clipped to the chest silhouette so
            it only ever slides across metal, never off into the page. */}
        <linearGradient id="sheenBar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="chestSilhouette">
          <path d="M40 58 L188 46 L188 156 L172 168 L40 168 Z" />
        </clipPath>
      </defs>

      {/* ---- Light rays, behind everything ---- */}
      <g className="chest-rays" style={{ opacity: open ? 1 : 0.55 }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <path
            key={i}
            d="M110 104 L99 -22 L121 -22 Z"
            fill="url(#rayFade)"
            transform={`rotate(${i * 36} 110 104)`}
          />
        ))}
      </g>

      {/* Contact shadow — without one the chest floats. */}
      <ellipse cx="112" cy="176" rx="66" ry="11" fill="#000" opacity="0.5" />

      {/* ---- Open interior: drawn BELOW the lid group, so lifting the lid
              is what reveals it. ---- */}
      <path
        d={`M40 104 L172 104 L${172 + DX} ${104 + DY} L${40 + DX} ${104 + DY} Z`}
        fill="#14161f"
        stroke={OUTLINE}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      {open && <ellipse cx="112" cy="98" rx="74" ry="34" fill="url(#innerGlow)" />}

      {/* ---- Base ---- */}
      <g>
        {/* right face */}
        <path
          d={`M172 104 L${172 + DX} ${104 + DY} L${172 + DX} ${156 + DY} L172 168 Z`}
          fill="url(#chestSide)"
          stroke={OUTLINE}
          strokeWidth={STROKE}
          strokeLinejoin="round"
        />
        {/* front face */}
        <path
          d="M40 104 L172 104 L172 168 L40 168 Z"
          fill="url(#chestFront)"
          stroke={OUTLINE}
          strokeWidth={STROKE}
          strokeLinejoin="round"
        />

        {/* vertical gold straps */}
        {[62, 134].map((x) => (
          <g key={x}>
            <rect x={x} y="104" width="18" height="64" fill="url(#goldFace)" stroke={OUTLINE} strokeWidth="2.4" />
            <circle cx={x + 9} cy="118" r="3" fill="#fff3c4" stroke={OUTLINE} strokeWidth="1.6" />
            <circle cx={x + 9} cy="154" r="3" fill="#fff3c4" stroke={OUTLINE} strokeWidth="1.6" />
          </g>
        ))}

        {/* base plinth — a lip along the bottom gives the box weight */}
        <rect x="36" y="156" width="140" height="14" rx="4" fill="url(#goldFace)" stroke={OUTLINE} strokeWidth={STROKE} strokeLinejoin="round" />
      </g>

      {/* ---- Lock: the focal point, straddling the lid/base seam ---- */}
      <g
        style={{
          transition: 'transform 0.45s ease-in, opacity 0.45s ease-in',
          transform: open ? 'translateY(26px) rotate(24deg)' : 'none',
          transformOrigin: '106px 112px',
          opacity: open ? 0 : 1,
        }}
      >
        <rect x="92" y="92" width="30" height="34" rx="6" fill="url(#goldFace)" stroke={OUTLINE} strokeWidth={STROKE} strokeLinejoin="round" />
        <circle cx="107" cy="105" r="5.2" fill="#3a2a08" stroke={OUTLINE} strokeWidth="1.6" />
        <path d="M104.6 108 L109.4 108 L111 119 L103 119 Z" fill="#3a2a08" stroke={OUTLINE} strokeWidth="1.4" strokeLinejoin="round" />
      </g>

      {/* ---- Lid: its own group so the burst can hinge it off the back ---- */}
      <g
        style={{
          transition: 'transform 0.5s cubic-bezier(0.34, 1.3, 0.64, 1)',
          transform: open ? 'translate(10px, -54px) rotate(-30deg)' : 'none',
          transformOrigin: '170px 96px',
        }}
      >
        {/* right face */}
        <path
          d={`M172 70 L${172 + DX} ${70 + DY} L${172 + DX} ${104 + DY} L172 104 Z`}
          fill="url(#chestSide)"
          stroke={OUTLINE}
          strokeWidth={STROKE}
          strokeLinejoin="round"
        />
        {/* top face */}
        <path
          d={`M40 70 L172 70 L${172 + DX} ${70 + DY} L${40 + DX} ${70 + DY} Z`}
          fill="url(#chestTop)"
          stroke={OUTLINE}
          strokeWidth={STROKE}
          strokeLinejoin="round"
        />
        {/* front face */}
        <path
          d="M40 70 L172 70 L172 104 L40 104 Z"
          fill="url(#chestFront)"
          stroke={OUTLINE}
          strokeWidth={STROKE}
          strokeLinejoin="round"
        />
        {/* gold lip along the lid's lower edge */}
        <rect x="36" y="92" width="140" height="14" rx="3" fill="url(#goldFace)" stroke={OUTLINE} strokeWidth={STROKE} strokeLinejoin="round" />
        {/* gold cap across the lid's top face, following the projection */}
        <path
          d={`M62 70 L80 70 L${80 + DX} ${70 + DY} L${62 + DX} ${70 + DY} Z`}
          fill="url(#goldTop)"
          stroke={OUTLINE}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d={`M134 70 L152 70 L${152 + DX} ${70 + DY} L${134 + DX} ${70 + DY} Z`}
          fill="url(#goldTop)"
          stroke={OUTLINE}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        {/* straps continuing down the lid's front */}
        {[62, 134].map((x) => (
          <g key={x}>
            <rect x={x} y="70" width="18" height="26" fill="url(#goldFace)" stroke={OUTLINE} strokeWidth="2.4" />
            <circle cx={x + 9} cy="80" r="3" fill="#fff3c4" stroke={OUTLINE} strokeWidth="1.6" />
          </g>
        ))}
      </g>

      {/* ---- Specular sweep, over the metal, under nothing ---- */}
      {!open && (
        <g clipPath="url(#chestSilhouette)">
          <rect className="chest-sheen-bar" x="-70" y="30" width="46" height="160" fill="url(#sheenBar)" transform="skewX(-18)" />
        </g>
      )}

      {/* ---- Burst sparkles ---- */}
      {open &&
        [
          { x: 52, y: 74, s: 1 },
          { x: 170, y: 66, s: 0.8 },
          { x: 110, y: 44, s: 1.2 },
          { x: 78, y: 52, s: 0.7 },
          { x: 146, y: 88, s: 0.9 },
        ].map((p, i) => (
          <path
            key={i}
            className="chest-sparkle"
            d="M0 -13 L3.2 -3.2 L13 0 L3.2 3.2 L0 13 L-3.2 3.2 L-13 0 L-3.2 -3.2 Z"
            fill="#fff6d0"
            transform={`translate(${p.x} ${p.y}) scale(${p.s})`}
            style={{ animationDelay: `${i * 70}ms` }}
          />
        ))}
    </svg>
  );
}
