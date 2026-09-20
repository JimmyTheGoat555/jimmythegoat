import { useState } from 'react';
import BottomSheet from '../shared/BottomSheet';
import JimmyAvatar from '../evolution/JimmyAvatar';
import { useJimmyLook } from '../../context/JimmyLook';
import { JIMMY_SPLITS, programWorkoutSummary, programWorkoutTemplate } from '../../data/jimmyWorkouts';

// Everything that used to sit on the lobby between the XP bar and the
// START button — the three ways into a session and the "plan one for
// later" link — behind one button, in one sheet. The lobby is Jimmy and
// the bar now; this is where the choosing happens.
//
// Two levels for your own routines (the menu, then a list) and three for
// Jimmy's Workouts (the menu, the splits, a split's sessions) — never
// more. A row in a list STARTS that routine on tap — the old picker made
// you select a card and then press the big button, and with the big
// button now behind you that second press would be a press on nothing.
// Every level below the menu has a Back row, so a wrong turn into a
// split is one tap to undo without closing the sheet.
//
// The delete and share controls on a template row are siblings of the
// row's own button, not children of it (the same arrangement MissionCard
// had): a tap on ✕ or 📤 must never also start the routine.

// Matches index.css's tab-slide-in-* keyframes, which the tab bar already
// uses for exactly this: a panel arriving from the side it was reached
// from.
const SLIDE_FORWARD = 'animate-[tab-slide-in-forward_0.22s_ease-out]';
const SLIDE_BACK = 'animate-[tab-slide-in-backward_0.22s_ease-out]';

const TITLES = {
  menu: 'Start a workout',
  templates: 'My workouts',
  assigned: 'Assigned missions',
  jimmy: "Jimmy's Workouts",
};

// The mascot's head as an option icon, with a star for "the pro picks".
// Reads the CURRENT look from context — the same character and tier the
// lobby is drawing — so the option is "your Jimmy's workouts", not a
// stock goat; a split can name its own character (Gena's Sculpt).
function MascotIcon({ mascot = null, size = 40 }) {
  const look = useJimmyLook();
  return (
    <span className="relative inline-flex shrink-0">
      <span className="overflow-hidden rounded-full border border-white/15 bg-neutral-800">
        <JimmyAvatar
          evolutionStage={look.evolutionStage}
          equippedAccessories={mascot ? [] : look.equippedAccessories}
          mascot={mascot ?? look.mascot}
          crop="head"
          size={size}
          alt=""
        />
      </span>
      {!mascot && (
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-950 text-[11px]"
        >
          ⭐
        </span>
      )}
    </span>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-neutral-500"
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

// A menu option: icon, what it does, what it means, chevron. `tone` is
// the accent border colour; written out in full per row rather than
// assembled (Tailwind only generates class names it can read whole).
function Option({ icon, title, subtitle, tone, disabled = false, onClick, testId, glow = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`flex w-full items-center gap-4 rounded-2xl border-2 bg-slate-900/80 px-4 py-4 text-left transition-all duration-150 active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100 ${tone} ${
        glow ? 'shadow-[0_0_26px_-8px_var(--tier-glow)]' : ''
      }`}
    >
      {typeof icon === 'string' ? (
        <span aria-hidden="true" className="text-3xl leading-none">
          {icon}
        </span>
      ) : (
        icon
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold leading-tight text-neutral-50">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-neutral-400">{subtitle}</span>
      </span>
      {!disabled && <Chevron />}
    </button>
  );
}

// One routine in a list. The whole row starts it; the optional controls
// sit beside the row's button, never inside it.
function RoutineRow({ icon, title, subtitle, meta, onStart, onDelete, onRecommend }) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onStart}
        className={`flex w-full items-center gap-3.5 rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-4 text-left transition active:scale-[0.98] ${
          onDelete || onRecommend ? 'pr-24' : 'pr-4'
        }`}
      >
        <span aria-hidden="true" className="text-2xl leading-none">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold text-neutral-50">{title}</span>
          {subtitle && <span className="mt-0.5 block text-xs leading-snug text-neutral-400">{subtitle}</span>}
          {meta && (
            <span className="mt-1 block text-[11px] font-semibold" style={{ color: 'var(--tier-accent)' }}>
              {meta}
            </span>
          )}
        </span>
      </button>
      {(onRecommend || onDelete) && (
        <span className="absolute inset-y-0 right-2 flex items-center gap-1">
          {onRecommend && (
            <button
              type="button"
              onClick={onRecommend}
              aria-label={`Recommend ${title} to a friend`}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-sm text-neutral-300 active:scale-90"
            >
              📤
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${title}`}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-sm text-neutral-300 active:scale-90"
            >
              ✕
            </button>
          )}
        </span>
      )}
    </div>
  );
}

function BackRow({ onBack, children }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-neutral-400 active:scale-95"
      >
        <span aria-hidden="true">←</span> Back
      </button>
      <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{children}</span>
    </div>
  );
}

export default function StartWorkoutSheet({
  open,
  onClose,
  assignments = [],
  templates = [],
  onStartWorkout,
  onStartAssigned,
  onStartTemplate,
  // Starts one of Jimmy's Workouts from the shape programWorkoutTemplate
  // builds. Optional: without it the option is simply not offered.
  onStartProgram = null,
  onDeleteTemplate = null,
  onRecommendTemplate = null,
  onPlanWorkout = null,
}) {
  const [step, setStep] = useState('menu');
  // The split whose sessions are showing, on the 'split' step.
  const [split, setSplit] = useState(null);
  // Which way the current step arrived, for its slide.
  const [direction, setDirection] = useState('forward');
  // Back to the menu each time the sheet opens — derived from the prop
  // during render (React's own pattern) rather than in an effect, and on
  // OPEN rather than close, so a closing sheet keeps its content while
  // it slides away.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setStep('menu');
      setSplit(null);
      setDirection('forward');
    }
  }

  // Levels, in order, so "back" is "one level up" rather than a second
  // table of where each step leads.
  const DEPTH = { menu: 0, templates: 1, assigned: 1, jimmy: 1, split: 2 };
  const go = (next) => {
    setDirection(DEPTH[next] < DEPTH[step] ? 'backward' : 'forward');
    setStep(next);
  };
  const openSplit = (nextSplit) => {
    setSplit(nextSplit);
    go('split');
  };

  // Starting anything closes the sheet first, so the slide-away and the
  // route change to the logger happen together rather than the sheet
  // being torn down mid-frame by the navigation.
  const start = (fn) => {
    navigator.vibrate?.(35);
    onClose?.();
    fn();
  };

  const plan = () => {
    onClose?.();
    onPlanWorkout?.();
  };

  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const slide = direction === 'forward' ? SLIDE_FORWARD : SLIDE_BACK;
  const title = step === 'split' && split ? split.name : TITLES[step];

  return (
    <BottomSheet open={open} onClose={onClose} title={title} compact={step === 'menu'}>
      <div key={step} className={`flex flex-col gap-3 ${slide}`} data-testid={`start-sheet-${step}`}>
        {step === 'menu' && (
          <>
            <Option
              icon="⚡"
              title="Start Empty Workout"
              subtitle="Add exercises as you go"
              tone="border-cyan-500/70"
              onClick={() => start(onStartWorkout)}
              testId="start-empty"
            />
            {/* The pro picks — pre-built splits, data/jimmyWorkouts.js.
                Tier-coloured and glowing where the others are flat: the
                one option that is a gift rather than a chore. */}
            {onStartProgram && (
              <Option
                icon={<MascotIcon />}
                title="Jimmy's Workouts"
                subtitle={`${count(JIMMY_SPLITS.length, 'pro split')} · pick one and go`}
                tone="border-[var(--tier-accent)]"
                glow
                onClick={() => go('jimmy')}
                testId="start-jimmy"
              />
            )}
            <Option
              icon="📋"
              title="Choose a Template"
              subtitle={
                templates.length > 0 ? count(templates.length, 'saved routine') : 'Save a workout to see it here'
              }
              tone="border-amber-500/70"
              disabled={templates.length === 0}
              onClick={() => go('templates')}
              testId="start-templates"
            />
            {assignments.length > 0 && (
              <Option
                icon="🎯"
                title="Assigned by Trainer"
                subtitle={`${count(assignments.length, 'routine')} from your trainer`}
                tone="border-violet-500/70"
                onClick={() => go('assigned')}
                testId="start-assigned"
              />
            )}
            {/* Quiet, and last: this starts nothing, so it must not read
                as a fourth way in. Planning ahead is the deliberate act of
                a returning user, not the primary call to action. */}
            {onPlanWorkout && (
              <button
                type="button"
                onClick={plan}
                data-testid="start-plan"
                className="mt-1 w-full py-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-400 transition active:scale-[0.98]"
              >
                📝 Plan a workout for later
              </button>
            )}
          </>
        )}

        {step === 'jimmy' && (
          <>
            <BackRow onBack={() => go('menu')}>{count(JIMMY_SPLITS.length, 'split')}</BackRow>
            {JIMMY_SPLITS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openSplit(item)}
                data-testid={`split-${item.id}`}
                className="flex w-full items-center gap-3.5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-left transition active:scale-[0.98]"
              >
                {item.mascot ? (
                  <MascotIcon mascot={item.mascot} size={44} />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-3xl leading-none"
                  >
                    {item.icon}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold leading-tight text-neutral-50">
                    {item.name}
                    {item.subtitle && <span className="font-medium text-neutral-400"> · {item.subtitle}</span>}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-neutral-400">{item.tagline}</span>
                  <span className="mt-1 block text-[11px] font-semibold" style={{ color: 'var(--tier-accent)' }}>
                    {count(item.workouts.length, 'session')} · {item.daysPerWeek}
                  </span>
                </span>
                <Chevron />
              </button>
            ))}
          </>
        )}

        {step === 'split' && split && (
          <>
            <BackRow onBack={() => go('jimmy')}>{split.short ?? split.name}</BackRow>
            <p className="-mt-1 mb-1 text-xs text-neutral-500">{split.tagline}</p>
            {split.workouts.map((workout) => (
              <RoutineRow
                key={workout.id}
                icon={split.icon}
                title={workout.name}
                subtitle={workout.focus}
                meta={programWorkoutSummary(workout)}
                onStart={() => start(() => onStartProgram(programWorkoutTemplate(split, workout)))}
              />
            ))}
          </>
        )}

        {step === 'templates' && (
          <>
            <BackRow onBack={() => go('menu')}>{count(templates.length, 'routine')}</BackRow>
            {templates.map((template) => (
              <RoutineRow
                key={template.id}
                icon="📋"
                title={template.title}
                subtitle="Saved template"
                meta={count(template.exercises?.length ?? 0, 'exercise')}
                onStart={() => start(() => onStartTemplate(template))}
                onDelete={onDeleteTemplate ? () => onDeleteTemplate(template.id) : undefined}
                onRecommend={onRecommendTemplate ? () => onRecommendTemplate(template) : undefined}
              />
            ))}
            {templates.length === 0 && (
              <p className="py-6 text-center text-sm text-neutral-500">No saved routines yet.</p>
            )}
          </>
        )}

        {step === 'assigned' && (
          <>
            <BackRow onBack={() => go('menu')}>{count(assignments.length, 'routine')}</BackRow>
            {assignments.map((assignment) => (
              <RoutineRow
                key={assignment.id}
                icon="🎯"
                title={assignment.title}
                subtitle={assignment.assignedByName ? `From ${assignment.assignedByName}` : 'Assigned workout'}
                meta={count(assignment.exercises?.length ?? 0, 'exercise')}
                onStart={() => start(() => onStartAssigned(assignment))}
              />
            ))}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
