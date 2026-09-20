import BottomSheet from '../shared/BottomSheet';
import { getMuscleGroup } from '../../data/exercises';

// The full entry for an exercise — what it is, then the form cues — in
// the shared bottom sheet. Opened from the (i) on a picker row. Reads the
// `description` and `tips` the exercise object carries (data/exercises.js
// folds them in from exerciseGuides.js; a custom exercise has them only
// if it was given them).
//
// `exercise` stays whatever it last was while the sheet closes, so the
// text is still there for the slide-out — see BottomSheet.
export default function ExerciseGuideSheet({ exercise, open, onClose }) {
  const group = exercise ? getMuscleGroup(exercise.muscleGroup) : null;
  const tips = exercise?.tips ?? [];

  return (
    <BottomSheet open={open && Boolean(exercise)} onClose={onClose} title={exercise?.name}>
      {exercise && (
        <div className="flex flex-col gap-5 pt-1">
          {group && (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: group.color }} aria-hidden="true" />
              {group.label}
            </span>
          )}
          {exercise.description && (
            <p className="text-[15px] leading-relaxed text-neutral-300">{exercise.description}</p>
          )}
          {tips.length > 0 && (
            <section>
              <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-500">Form cues</h3>
              <ul className="flex flex-col gap-2.5">
                {tips.map((tip) => (
                  <li key={tip} className="flex gap-3 text-sm leading-snug text-neutral-200">
                    <span
                      className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: 'var(--tier-accent)' }}
                      aria-hidden="true"
                    />
                    {tip}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
