import { tierGradientCss } from '../../utils/tierTheme';

const CARD_CLIP =
  'polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px)';

// A glowing gradient-bordered wrapper — same trick AuthScreen's GlowField
// uses (a gradient-filled shape behind a near-opaque fill), reused
// app-wide so cards/avatars can carry the user's current tier color.
// `shape="card"` (default) cuts the same angled corners `.card` itself
// uses, so a selected mission card/evolution panel reads as one
// continuous piece instead of a rounded ring around an angled card.
// `shape="circle"` is for avatars.
export default function GradientBorder({
  tierId,
  className = '',
  fillClassName = 'card',
  shape = 'card',
  glow = true,
  children,
}) {
  const clip = shape === 'circle' ? undefined : CARD_CLIP;
  const radius = shape === 'circle' ? '9999px' : undefined;

  return (
    <div
      className={`p-[3px] ${glow ? 'drop-shadow-[0_0_16px_var(--tier-glow)]' : ''} ${className}`}
      style={{ background: tierGradientCss(tierId), clipPath: clip, borderRadius: radius }}
    >
      {/* Nearly-opaque fill, not `.card`'s own translucency — with the
          vivid gradient sitting 3px away, any blur/heavy translucency
          here would smear that color across the whole panel instead of
          reading as a crisp border. */}
      <div
        className={fillClassName}
        style={{ clipPath: clip, borderRadius: radius, backgroundColor: 'rgba(12, 4, 28, 0.95)' }}
      >
        {children}
      </div>
    </div>
  );
}
