// The web stand-in for a rewarded ad, drawn over whatever is on screen.
//
// WEB ONLY. On native the AdMob SDK draws its own full-screen ad over the
// app and this would sit uselessly behind it — callers gate on
// useRewardedAd's `isNative` for that reason.
//
// Full screen and NOT dismissible, because a rewarded ad is not: closing
// it early is exactly the case where a real SDK pays nothing, and a fake
// one that can be tapped away in half a second would teach the wrong
// habit before the real thing lands.
//
// Shared by the Store's coin ad (AdRewardCard) and the rest timer's 2×
// offer, which is why the words are props: the only thing the two have
// in common is that an ad is playing. z-70 clears the full-screen rest
// timer (z-60) — the countdown keeps running underneath, which is the
// whole promise the rest-timer offer makes.
export default function AdPlayingOverlay({
  rewarding = false,
  caption,
  rewardingTitle = 'Adding your coins…',
  rewardingCaption = 'One moment.',
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-neutral-950/97 px-6"
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" className="text-5xl leading-none">
        🎬
      </span>
      <p className="text-xl font-bold text-neutral-50">{rewarding ? rewardingTitle : 'Watching Ad…'}</p>
      <p className="text-center text-sm text-neutral-500">{rewarding ? rewardingCaption : caption}</p>
      <span aria-hidden="true" className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full w-full origin-left animate-[ad-progress_3s_linear_forwards] bg-[var(--ember)]" />
      </span>
    </div>
  );
}
