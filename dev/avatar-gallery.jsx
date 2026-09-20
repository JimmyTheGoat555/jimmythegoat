import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import JimmyAvatar from '../src/components/evolution/JimmyAvatar';
import JimmyAnimation from '../src/components/evolution/JimmyAnimation';
import { STORE_ITEMS, OUTFIT_SLOT } from '../src/data/storeItems';
import { MASCOTS, equippedOutfitFor, mascotCanWear, mascotSpriteFor } from '../src/data/mascots';
import { anchorsFor } from '../src/data/avatarAnchors';
import { getDanceAnimationPath } from '../src/utils/danceAnimations';

// Every mascot × tier × outfit × accessory the renderer can draw, on one
// page, at a size where a two-pixel miss is visible. The calibration
// bench for src/data/avatarAnchors.js: `?anchors=1` draws each sprite's
// anchor points over it, `?clips=1` adds the dance clips beside their
// sprite so sprite-to-clip registration can be checked too.
//
// Dev only — this page is never built (see avatar-gallery.html).

const params = new URLSearchParams(location.search);
const SHOW_ANCHORS = params.get('anchors') === '1';
const SHOW_CLIPS = params.get('clips') === '1';
const SIZE = Number(params.get('size')) || 240;
// `?mascot=gena&stage=2` narrows the page to one row group, which is how
// to look at one body large without scrolling.
const ONLY_MASCOT = params.get('mascot');
const ONLY_STAGE = Number(params.get('stage')) || null;
// `?outfit=blue` keeps only that set's rows (plus the plain sprite row).
const ONLY_OUTFIT = params.get('outfit');
const TIERS = [1, 2, 3, 4].filter((t) => !ONLY_STAGE || t === ONLY_STAGE);

const accessories = STORE_ITEMS.filter((i) => i.type === 'accessory');
const headGear = accessories.filter((i) => i.slot !== OUTFIT_SLOT);

function Cell({ label, children }) {
  return (
    <figure className="m-0 flex flex-col items-center gap-1">
      <div className="relative" style={{ height: SIZE }}>
        {children}
      </div>
      <figcaption className="text-[10px] text-neutral-500">{label}</figcaption>
    </figure>
  );
}

function AnchorOverlay({ mascot, stage, equipped }) {
  if (!SHOW_ANCHORS) return null;
  const anchors = anchorsFor(mascot, stage, equippedOutfitFor(mascot, equipped));
  if (!anchors) return null;
  const mark = (x, y, color, w = null) => (
    <div
      className="pointer-events-none absolute"
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, transform: 'translate(-50%,-50%)' }}
    >
      <div style={{ width: 8, height: 8, borderRadius: 4, background: color, boxShadow: '0 0 0 1px #000' }} />
      {w != null && (
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: `${w * SIZE * anchors.aspect}px`, height: 1, background: color, transform: 'translate(-50%,-50%)' }} />
      )}
    </div>
  );
  return (
    <div className="pointer-events-none absolute inset-0 flex justify-center" style={{ zIndex: 50 }}>
      <div className="relative h-full" style={{ aspectRatio: `${anchors.aspect}` }}>
        {mark(anchors.eyes.x, anchors.eyes.y, '#ff4d6d', anchors.eyes.span)}
        {mark(anchors.head.x, anchors.head.y, '#ffd166', anchors.head.width)}
        {anchors.neck && mark(anchors.neck.x, anchors.neck.y, '#06d6a0', anchors.neck.width)}
        {anchors.hips && mark(anchors.hips.x, anchors.hips.y, '#4cc9f0', anchors.hips.width)}
        <div className="absolute left-0 right-0" style={{ top: `${anchors.ground * 100}%`, height: 1, background: '#fff' }} />
      </div>
    </div>
  );
}

function Row({ mascot, stage, outfitId = null }) {
  const base = outfitId ? [outfitId] : [];
  const wearableGear = headGear.filter((i) => mascotCanWear(mascot, i.id));
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-white/10 py-3">
      <Cell label={`${mascot} · stage ${stage}${outfitId ? ` · ${outfitId.replace('accessory-', '')}` : ''}`}>
        <JimmyAvatar evolutionStage={stage} mascot={mascot} equippedAccessories={base} size={SIZE} />
        <AnchorOverlay mascot={mascot} stage={stage} equipped={base} />
      </Cell>
      {wearableGear.map((item) => (
        <Cell key={item.id} label={item.name}>
          <JimmyAvatar evolutionStage={stage} mascot={mascot} equippedAccessories={[...base, item.id]} size={SIZE} />
          <AnchorOverlay mascot={mascot} stage={stage} equipped={base} />
        </Cell>
      ))}
      <Cell label="all head gear">
        <JimmyAvatar
          evolutionStage={stage}
          mascot={mascot}
          equippedAccessories={[...base, ...wearableGear.filter((i) => ['head', 'eyes'].includes(i.slot)).map((i) => i.id)]}
          size={SIZE}
        />
      </Cell>
      {SHOW_CLIPS &&
        [1, 2, 3, 4].map((dance) => (
          <Cell key={dance} label={`dance ${dance} (clip over sprite)`}>
            {/* A square box, as the lobby gives it: the clip's canvas is
                wider than the sprite's and both are object-contain'd
                into the same square, which is exactly the registration
                being checked. */}
            <div style={{ width: SIZE, height: SIZE }}>
              <JimmyAnimation
                animationSrc={getDanceAnimationPath(dance, stage, mascot)}
                staticImageSrc={mascotSpriteFor(mascot, stage, base)}
                alt=""
                className="h-full w-full"
                evolutionStage={stage}
                equippedAccessories={[...base, 'accessory-shades', 'accessory-headphones']}
                mascot={mascot}
              />
            </div>
          </Cell>
        ))}
    </div>
  );
}

function Gallery() {
  return (
    <main className="px-4 py-6">
      <h1 className="mb-1 text-lg font-bold">Avatar gallery</h1>
      <p className="mb-4 text-xs text-neutral-500">
        ?anchors=1 draws the anchor points · ?clips=1 adds the dance clips · ?size=N sets the sprite height (px) · ?mascot=gena&stage=2 narrows to one body
      </p>
      {Object.values(MASCOTS).filter((m) => !ONLY_MASCOT || m.id === ONLY_MASCOT).map((m) => (
        <section key={m.id} className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">{m.name}</h2>
          {TIERS.map((stage) => (
            <div key={stage}>
              <Row mascot={m.id} stage={stage} />
              {Object.keys(m.outfits ?? {}).filter((id) => !ONLY_OUTFIT || id.includes(ONLY_OUTFIT)).map((outfitId) => (
                <Row key={outfitId} mascot={m.id} stage={stage} outfitId={outfitId} />
              ))}
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
