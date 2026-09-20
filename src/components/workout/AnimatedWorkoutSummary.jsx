import { useEffect, useMemo, useRef, useState } from 'react';
import { mascotSpriteFor, resolveMascotId } from '../../data/mascots';
import { useAnimationClock } from '../../hooks/useAnimationClock';
import { easeOutBack, easeOutCubic, eased, lerp, phase } from '../../utils/motion';
import { formatRecordLoad } from '../../utils/personalRecords';
import { summaryFromWorkout } from '../../utils/workoutSummaryData';
import {
  INTRO_MS,
  OUTRO_MS,
  ROW_REVEAL_MS,
  STATS_AT,
  STATS_MS,
  STRIKE_MS,
  SUMMARY_HEIGHT,
  SUMMARY_WIDTH,
  buildRows,
  buildSummaryTimeline,
} from '../../utils/workoutSummaryTimeline';
import {
  formatClockParts,
  formatSetChip,
  formatSetsDigest,
  formatSummaryDate,
  formatVolume,
} from '../../utils/workoutSummaryFormat';

// The story of one workout on one card, animated.
//
// ── SELF-CONTAINED ON PURPOSE ────────────────────────────────────────────
//
// This card is the thing that will become the Instagram story sticker.
// utils/workoutSummaryScene.js draws it into a canvas frame by frame (a
// recorder once turned that into a clip; the clip was cut), and that
// only works if the card meets three conditions this file is built
// around:
//
//   1. FIXED SIZE. It is laid out at SUMMARY_WIDTH × SUMMARY_HEIGHT design
//      pixels (9:16, the story format) and never reflows. The phone fits
//      it on screen by scaling the whole card (WorkoutCelebration's
//      ScaledStage); the exporter renders it at 3× for 1080×1920. Same
//      layout both times, to the pixel.
//   2. ONE CLOCK. Every moving thing on it — the count-ups, the strikes,
//      the reveals — is a pure function of `elapsed` milliseconds
//      (utils/motion.js). No CSS transitions, no chained timeouts, no
//      state that remembers where an animation "is". So a frame at
//      t = 2,340ms is the same frame whether the clock got there by
//      playing or by being told to.
//   3. NO CONTEXT, NO ROUTER, NO POSITIONING. Everything it draws arrives
//      as props — including which mascot — and it renders inline in
//      whatever box it is given. The full-screen chrome, the button and
//      the coin lines belong to WorkoutCelebration, which is why they are
//      not here.
//
// Feed it either way: a whole `workout` object — the finish flow's payload
// or a stored History document, adapted by utils/workoutSummaryData.js —
// or the loose numbers as props. Loose props win where both are given.
// Nothing here writes anywhere, so a replay of an old session is exactly
// as safe as looking at it.
//
// Play it uncontrolled (the default: it runs its own clock and calls
// `onFinished` at the end) or controlled, by passing `elapsedMs` — then it
// draws exactly that instant and nothing moves until the number changes.
// utils/workoutSummaryTimeline.js is the choreography — exported on its
// own so the exporter can ask how long the whole thing runs before it
// starts stepping.

// The frame size lives with the timeline (utils/workoutSummaryTimeline.js)
// so the canvas twin can size itself without importing React; re-exported
// here for the screens that lay the card out.
export { SUMMARY_WIDTH, SUMMARY_HEIGHT };

const ARCADE = { fontFamily: 'var(--font-arcade)' };

// ── Pieces ─────────────────────────────────────────────────────────────

function Stat({ label, value, unit, progress, align = 'left' }) {
  // Settles from slightly small and soft as the count lands, so the
  // number arrives rather than simply being there.
  const settle = easeOutCubic(progress);
  return (
    <div className={`flex min-w-0 flex-1 flex-col ${align === 'right' ? 'items-end text-right' : 'items-start'}`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/45">{label}</span>
      <span
        className="mt-1 flex items-baseline gap-1.5 leading-none"
        style={{
          transform: `scale(${lerp(0.9, 1, settle)})`,
          transformOrigin: align === 'right' ? 'right bottom' : 'left bottom',
          opacity: lerp(0.35, 1, settle),
          filter: `blur(${lerp(3, 0, settle)}px)`,
        }}
      >
        <span
          className="text-[52px] tabular-nums text-white"
          style={{
            ...ARCADE,
            textShadow: `0 0 ${lerp(6, 26, settle)}px color-mix(in srgb, var(--tier-accent) ${Math.round(lerp(20, 55, settle))}%, transparent)`,
          }}
        >
          {value}
        </span>
        <span className="text-[15px] tracking-[0.12em] text-[var(--tier-accent)]" style={ARCADE}>
          {unit}
        </span>
      </span>
    </div>
  );
}

function Row({ row, beat, t, compact }) {
  const reveal = eased(t, beat.at, ROW_REVEAL_MS);
  const strike = eased(t, beat.strikeAt, STRIKE_MS, easeOutCubic);
  // The tick pops as the line starts to move, overshooting a touch.
  const tick = eased(t, beat.strikeAt, 300, easeOutBack);
  // A wash of accent behind the row while it is being struck, gone a
  // moment later — the eye follows the light down the list.
  const flash = strike > 0 ? 1 - phase(t, beat.strikeAt + STRIKE_MS * 0.6, 520) : 0;
  const struck = strike >= 1;
  const oneLine = compact || row.overflow;
  const chips = row.sets.slice(0, 6);
  const extra = row.sets.length - chips.length;
  const digestColor = `color-mix(in srgb, var(--tier-accent) ${Math.round(70 * strike)}%, rgba(255,255,255,0.55))`;

  return (
    <li
      className={`relative flex flex-col justify-center rounded-xl px-2.5 ${oneLine ? 'h-[33px]' : 'h-[50px]'}`}
      style={{
        opacity: reveal,
        transform: `translateY(${lerp(8, 0, reveal)}px)`,
        background: `color-mix(in srgb, var(--tier-accent) ${Math.round(12 * flash)}%, rgba(255,255,255,0.03))`,
      }}
    >
      <div className="flex items-center gap-2.5">
        {/* Check circle — empty ring until its beat, then filled. */}
        <span
          aria-hidden="true"
          className={`relative flex shrink-0 items-center justify-center rounded-full ${oneLine ? 'h-4 w-4' : 'h-[18px] w-[18px]'}`}
          style={{
            border: `1.5px solid ${struck || tick > 0 ? 'var(--tier-accent)' : 'rgba(255,255,255,0.22)'}`,
            background: `color-mix(in srgb, var(--tier-accent) ${Math.round(100 * Math.min(1, tick))}%, transparent)`,
            boxShadow: tick > 0 ? `0 0 ${10 * Math.min(1, tick)}px var(--tier-glow)` : 'none',
            transform: `scale(${tick > 0 ? lerp(0.7, 1, tick) : 1})`,
          }}
        >
          <svg
            viewBox="0 0 12 12"
            className="h-2.5 w-2.5"
            style={{ opacity: Math.min(1, tick * 1.4) }}
            aria-hidden="true"
          >
            <path
              d="M2.2 6.3 4.9 9 9.8 3.4"
              fill="none"
              stroke="#07120a"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        {/* The name, with the strike-through drawn over it as its own
          element so it can be grown from the left instead of switched on. */}
        <span className="relative min-w-0 flex-1">
          <span
            className={`block truncate font-semibold ${oneLine ? 'text-[13px]' : 'text-[15px]'} ${row.overflow ? 'italic' : ''}`}
            style={{ color: `rgba(255,255,255,${lerp(0.96, 0.42, strike)})` }}
          >
            {row.name}
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 right-0 top-1/2 h-[2px] rounded-full"
            style={{
              background: 'var(--tier-accent)',
              boxShadow: `0 0 ${lerp(10, 4, strike)}px var(--tier-glow)`,
              transform: `translateY(-50%) scaleX(${strike})`,
              transformOrigin: 'left center',
              opacity: strike > 0 ? 1 : 0,
            }}
          />
        </span>

        {row.pr && (
          <span
            className="shrink-0 rounded-md border border-amber-300/50 bg-amber-300/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-amber-200"
            style={{
              opacity: Math.min(1, tick),
              transform: `scale(${tick > 0 ? lerp(0.8, 1, tick) : 0.8})`,
              boxShadow: tick > 0 ? '0 0 12px rgba(252,211,77,0.35)' : 'none',
            }}
            title={`New PR · ${formatRecordLoad(row.pr)}${row.pr.reps ? ` × ${row.pr.reps}` : ''}`}
          >
            PR
          </span>
        )}

        {/* Sets. A one-line row (a long session, or the "+N more" row)
          carries a digest on the right; a roomy row lists every set as a
          chip on its own line underneath. Either way they tint to the
          accent as the row is struck, so the numbers read as "done" along
          with the name. */}
        {oneLine && (
          <span className="shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: digestColor }}>
            {row.digest ?? formatSetsDigest(row.sets)}
          </span>
        )}
      </div>

      {!oneLine && (
        <div className="mt-[3px] flex items-center gap-1 pl-[28px]">
          {chips.map((set, i) => (
            <span
              key={i}
              className="rounded-md px-1.5 py-[3px] text-[10.5px] font-bold tabular-nums leading-none"
              style={{
                background: `color-mix(in srgb, var(--tier-accent) ${Math.round(18 * strike)}%, rgba(255,255,255,0.06))`,
                color: `color-mix(in srgb, var(--tier-accent) ${Math.round(85 * strike)}%, rgba(255,255,255,0.7))`,
              }}
            >
              {formatSetChip(set)}
            </span>
          ))}
          {extra > 0 && <span className="text-[10px] font-bold text-white/40">+{extra}</span>}
        </div>
      )}
    </li>
  );
}

// ── The card ───────────────────────────────────────────────────────────

export default function AnimatedWorkoutSummary({
  // Any workout object: the finish flow's payload or a stored document.
  // See summaryFromWorkout for what is read off it.
  workout = null,
  // [{ name, sets: [{ reps, weight, isBodyweight, addedWeight }] }] —
  // completed sets only, filtered by the caller. Overrides `workout`.
  exercises: exercisesProp,
  durationMs: durationMsProp,
  totalVolumeKg: totalVolumeKgProp,
  // The server's record list, keyed to rows by exercise name.
  personalRecords: personalRecordsProp,
  // Which character stands in the footer, and what they are wearing —
  // props, never context, so the exporter can hand in exactly what it
  // wants drawn.
  mascot = 'jimmy',
  equippedAccessories = [],
  finishedAt = null,
  // Controlled playback: draw this instant and leave the clock alone.
  elapsedMs = null,
  // Uncontrolled: jump to the end (the "skip" affordance).
  skipToEnd = false,
  onFinished,
  // ('strike' | 'finish') as each beat passes — for haptics, which have to
  // fire at the moment and so cannot be derived from a frame.
  onBeat,
}) {
  // Frozen at mount: the workout is finished, nothing here changes —
  // except the records, which stay live (below).
  const [data] = useState(() => {
    const fromWorkout = workout ? summaryFromWorkout(workout) : null;
    return {
      exercises: exercisesProp ?? fromWorkout?.exercises ?? [],
      durationMs: durationMsProp ?? fromWorkout?.durationMs ?? 0,
      totalVolumeKg: totalVolumeKgProp ?? fromWorkout?.totalVolumeKg ?? 0,
      personalRecords: personalRecordsProp ?? fromWorkout?.personalRecords ?? [],
      finishedAt: finishedAt ?? fromWorkout?.finishedAt ?? null,
    };
  });
  const { exercises, durationMs, totalVolumeKg } = data;
  // Live, not frozen: the finish flow shows this card the moment "Done"
  // is tapped, before the server has answered, and the server's record
  // list arrives a beat or two later. A PR pill on a row already struck
  // simply appears; the rest of the card never moves.
  const personalRecords = personalRecordsProp ?? data.personalRecords;
  const rows = useMemo(() => buildRows(exercises, personalRecords), [exercises, personalRecords]);
  const [timeline] = useState(() => buildSummaryTimeline(exercises));
  const [stampedAt] = useState(() => (data.finishedAt ? Date.parse(data.finishedAt) : Date.now()));
  const [broken, setBroken] = useState(false);

  const controlled = typeof elapsedMs === 'number';
  const clock = useAnimationClock({
    running: !controlled,
    endAt: timeline.endAt,
    onEnd: controlled ? undefined : onFinished,
  });
  const t = controlled ? Math.max(0, Math.min(timeline.endAt, elapsedMs)) : clock.elapsed;

  const { seek } = clock;
  useEffect(() => {
    if (skipToEnd && !controlled) seek(timeline.endAt);
  }, [skipToEnd, controlled, seek, timeline.endAt]);

  // Controlled playback reaching the end still counts as finishing.
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);
  const controlledDone = controlled && t >= timeline.endAt;
  useEffect(() => {
    if (controlledDone) onFinishedRef.current?.();
  }, [controlledDone]);

  // Beats crossed since the previous frame. A long jump (a skip, a tab
  // that was hidden) fires only the finish rather than a burst of buzzes.
  const onBeatRef = useRef(onBeat);
  useEffect(() => {
    onBeatRef.current = onBeat;
  }, [onBeat]);
  const lastRef = useRef(-1);
  useEffect(() => {
    const prev = lastRef.current;
    lastRef.current = t;
    if (prev < 0 || t <= prev || !onBeatRef.current) return;
    if (t - prev > 1500) {
      if (t >= timeline.outroAt && prev < timeline.outroAt) onBeatRef.current('finish');
      return;
    }
    for (const beat of timeline.rows) {
      if (beat.strikeAt > prev && beat.strikeAt <= t) onBeatRef.current('strike');
    }
    if (timeline.outroAt > prev && timeline.outroAt <= t) onBeatRef.current('finish');
  }, [t, timeline]);

  const mascotId = resolveMascotId(mascot);
  const sprite = useMemo(() => mascotSpriteFor(mascotId, 4, equippedAccessories), [mascotId, equippedAccessories]);
  const fallback = mascotSpriteFor(mascotId, 4);

  const intro = eased(t, 0, INTRO_MS);
  const header = eased(t, 120, 380);
  const stats = phase(t, STATS_AT, STATS_MS);
  // Cubic rather than expo: the number should be seen counting, not
  // arrive in the first three frames and idle for a second.
  const count = easeOutCubic(stats);
  const outro = eased(t, timeline.outroAt, OUTRO_MS, easeOutBack);
  const outroLinear = phase(t, timeline.outroAt, OUTRO_MS);

  const hoursFormat = durationMs >= 60 * 60 * 1000;
  const clockParts = formatClockParts(durationMs * count, {
    hours: hoursFormat,
  });
  const setCount = (Array.isArray(exercises) ? exercises : []).reduce(
    (n, e) => n + (Array.isArray(e?.sets) ? e.sets.length : 0),
    0,
  );
  const prCount = new Set((personalRecords ?? []).map((r) => r.name)).size;
  const compact = timeline.compact;

  return (
    <div
      className="relative overflow-hidden rounded-[28px] text-white select-none"
      style={{
        width: SUMMARY_WIDTH,
        height: SUMMARY_HEIGHT,
        background: 'linear-gradient(180deg, #0d0736 0%, #06021c 48%, #03010f 100%)',
        border: '1px solid rgba(255,255,255,0.09)',
        boxShadow: `0 0 0 1px rgba(0,0,0,0.6), 0 40px 90px -30px var(--tier-glow), 0 20px 50px -20px rgba(0,0,0,0.9)`,
        transform: `scale(${lerp(0.96, 1, intro)})`,
        opacity: intro,
      }}
    >
      {/* Ambient light: a tier-coloured bloom at the top that brightens as
          the numbers land, and a faint grid so the black has a surface. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(70% 45% at 50% -6%, color-mix(in srgb, var(--tier-accent) ${Math.round(lerp(14, 30, count))}%, transparent), transparent 70%)`,
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9), transparent 70%)',
          WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9), transparent 70%)',
        }}
      />

      <div className="relative flex h-full flex-col px-5 pt-5">
        {/* Header: the verdict on the left, the date on the right. */}
        <div
          className="flex items-center justify-between"
          style={{
            opacity: header,
            transform: `translateY(${lerp(-6, 0, header)}px)`,
          }}
        >
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em]"
            style={{
              color: 'var(--tier-accent)',
              borderColor: 'color-mix(in srgb, var(--tier-accent) 45%, transparent)',
              background: 'color-mix(in srgb, var(--tier-accent) 12%, transparent)',
              boxShadow: `0 0 ${lerp(0, 16, outroLinear)}px var(--tier-glow)`,
            }}
          >
            <span aria-hidden="true">✓</span> Workout complete
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
            {formatSummaryDate(stampedAt)}
          </span>
        </div>

        {/* The two headline numbers, racing up together. */}
        <div className="mt-6 flex items-end gap-4">
          <Stat label="Time" value={clockParts.value} unit={clockParts.unit} progress={stats} />
          <div
            aria-hidden="true"
            className="mb-3 h-11 w-px shrink-0"
            style={{
              background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.22), transparent)',
            }}
          />
          <Stat label="Volume" value={formatVolume(totalVolumeKg * count)} unit="KG" progress={stats} align="right" />
        </div>

        {/* A hairline that draws itself under the stats as they land. */}
        <div
          aria-hidden="true"
          className="mt-4 h-px"
          style={{
            background: 'linear-gradient(90deg, var(--tier-accent), rgba(255,255,255,0.18) 60%, transparent)',
            transform: `scaleX(${easeOutCubic(stats)})`,
            transformOrigin: 'left center',
            boxShadow: '0 0 10px var(--tier-glow)',
          }}
        />

        {/* The list, crossed off one row at a time. */}
        <ul className={`mt-3 flex min-h-0 flex-1 flex-col ${compact ? 'gap-[3px]' : 'gap-1'}`}>
          {rows.map((row, i) => (
            <Row key={`${row.name}-${i}`} row={row} beat={timeline.rows[i]} t={t} compact={compact} />
          ))}
          {rows.length === 0 && (
            <li className="flex flex-1 items-center justify-center text-sm text-white/40">Nothing logged.</li>
          )}
        </ul>

        {/* Footer: the mascot's spot, and the app's name. The sprite is
            drawn taller than the zone and clipped by the card, which is
            what turns a full-body sprite into a bust. Swap the file per
            mascot in CELEBRATION_POSES below once the arms-crossed renders
            exist; nothing else here changes. */}
        <div className="relative -mx-5 mt-2 h-[168px] shrink-0">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-full"
            style={{
              background: `radial-gradient(60% 70% at 24% 100%, color-mix(in srgb, var(--tier-accent) ${Math.round(lerp(12, 34, outroLinear))}%, transparent), transparent 70%)`,
            }}
          />
          <img
            src={broken ? fallback : sprite}
            alt=""
            draggable="false"
            onError={() => setBroken(true)}
            className="absolute left-3 top-1 origin-top object-contain object-top"
            style={{
              height: mascotId === 'gena' ? 370 : 320,
              transform: `translateY(${lerp(10, 0, outro)}px) scale(${lerp(0.97, 1, outro)})`,
              filter: `drop-shadow(0 0 ${lerp(6, 22, outroLinear)}px var(--tier-glow)) drop-shadow(0 10px 18px rgba(0,0,0,0.6))`,
              opacity: lerp(0.85, 1, outroLinear),
            }}
          />

          <div className="absolute bottom-5 right-5 flex flex-col items-end gap-2 text-right">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/55"
              style={{
                opacity: outroLinear,
                transform: `translateY(${lerp(6, 0, outro)}px)`,
              }}
            >
              {setCount} set{setCount === 1 ? '' : 's'}
              {prCount > 0 && (
                <>
                  {' · '}
                  <span className="text-amber-300">
                    {prCount} PR{prCount === 1 ? '' : 's'}
                  </span>
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <img
                src="/newlogo.zozo.png"
                alt=""
                draggable="false"
                className="h-7 w-7 rounded-lg object-cover"
                style={{
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.5)',
                }}
              />
              <span
                className="text-[19px] italic uppercase leading-none tracking-wide text-white"
                style={{ ...ARCADE, textShadow: '2px 2px 0 rgba(0,0,0,0.85)' }}
              >
                Jimmy the Goat
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
