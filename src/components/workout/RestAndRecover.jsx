// What the Workout tab shows instead of a START button while the cooldown
// is running.
//
// The point of this screen is not the refusal, it is the ANSWER: a
// rejection used to arrive after a full session of logged sets, and the
// only thing that made it bearable would have been knowing in advance. So
// the countdown is the loudest thing here, and the wall-clock unlock time
// sits under it — four hours is long enough that "3:41:07" alone makes you
// do arithmetic to plan your evening.
//
// The clock is aria-hidden and the sentence below it carries the same
// information in words: a live region ticking once a second would make a
// screen reader unusable, and "unlocks at 18:40" is the part worth
// announcing anyway.
export default function RestAndRecover({ remaining, unlocksAt, onPlanWorkout }) {
  const unlockTime =
    typeof unlocksAt === 'number'
      ? new Date(unlocksAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : null;

  return (
    // pb-20 on THIS block, not on the page container — the container's own
    // pb-6 is load-bearing for the mt-auto that pins this to the bottom of
    // the viewport. The 5rem clears the fixed nav, which matters now that
    // the mission picker stays up during a cooldown: the page is taller
    // than the viewport, so the bottom of the document is a real scroll
    // position rather than something mt-auto has already held clear, and
    // without this the Draft button ends up underneath the tab bar.
    <div className="w-full max-w-xs mt-auto flex flex-col items-center gap-4 pb-20">
      <div
        className="w-full rounded-3xl border border-amber-400/25 bg-amber-400/5 px-5 py-6 text-center"
        style={{ boxShadow: '0 0 40px -18px rgba(251,191,36,0.6)' }}
      >
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300/80">Rest &amp; Recover</p>

        <p
          aria-hidden="true"
          className="mt-3 font-mono text-4xl font-bold tabular-nums text-amber-300"
          style={{ textShadow: '0 0 18px rgba(251,191,36,0.55)' }}
        >
          {remaining}
        </p>

        <p className="mt-3 text-sm leading-snug text-neutral-300">
          Muscles need rest! Your next mission unlocks
          {unlockTime ? (
            <>
              {' '}
              at <span className="font-semibold text-neutral-100">{unlockTime}</span>.
            </>
          ) : (
            ' shortly.'
          )}
        </p>
      </div>

      {/* The whole reason this screen is not a dead end. Planning is not
          training, so it is deliberately NOT gated by the cooldown — you
          can build tomorrow's session while today's is still settling. */}
      {onPlanWorkout && (
        <button
          type="button"
          onClick={onPlanWorkout}
          className="w-full rounded-2xl border border-white/15 bg-white/5 py-4 text-base font-semibold text-neutral-100 transition active:scale-[0.97]"
        >
          📝 Draft a Battle Plan
        </button>
      )}
    </div>
  );
}
