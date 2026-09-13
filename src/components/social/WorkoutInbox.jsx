import { useState } from 'react';
import { getMuscleGroup } from '../../data/exercises';

// The two things that arrive here and need a hand: a workout a friend sent
// (accept or dismiss) and the receipt for a bounty one of yours just
// earned (dismiss).
//
// Named for what it is rather than the "InboxPopup" it was sketched as: a
// popup would have to interrupt something, and the one moment it could
// interrupt is the moment someone opened the app to train. This sits at
// the top of the Social tab instead, above the notification list, where
// the tab badge already sends people when something arrives — visible
// every time, in the way exactly once (when you answer it).
//
// Renders nothing at all when the inbox is empty. An empty-state card for
// a feature that is idle most of the time is just permanent furniture.

function exercisePreview(exercises = []) {
  const names = exercises.map((e) => e?.name).filter(Boolean);
  if (names.length === 0) return null;
  const shown = names.slice(0, 3).join(' · ');
  return names.length > 3 ? `${shown} +${names.length - 3} more` : shown;
}

export default function WorkoutInbox({ items = [], onAccept, onDecline }) {
  // Which routine is opened out in full. "Accept & Save" was previously a
  // decision made on three exercise names and an ellipsis — fine for a
  // three-lift push day, useless for anything longer, and the only way to
  // find out what you had agreed to was to accept it and go look. One at a
  // time, since two open lists in a stack of cards is a page of exercises
  // with the buttons pushed off the bottom.
  const [openId, setOpenId] = useState(null);
  // Which card is mid-write. The row stays on screen until the Firestore
  // snapshot drops it, so without this the button would look inert for the
  // round trip and invite a second tap (the hook latches those out anyway
  // — this is so it never looks like it needs one).
  const [busyId, setBusyId] = useState(null);
  // Keyed by item id rather than a single message: two cards can fail
  // independently, and "something went wrong" floating above the list
  // would not say which one.
  const [errors, setErrors] = useState({});

  if (items.length === 0) return null;

  const run = async (item, action) => {
    setBusyId(item.id);
    setErrors((prev) => ({ ...prev, [item.id]: null }));
    try {
      await action(item);
    } catch {
      // Both paths write to Firestore, so offline is the realistic
      // failure. Saying so on the card beats a button that silently does
      // nothing and invites a second tap.
      setErrors((prev) => ({ ...prev, [item.id]: "Couldn't do that — check your connection and try again." }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="text-lg font-semibold text-neutral-100">
        Inbox
        <span className="ml-1.5 text-sm" style={{ color: 'var(--tier-accent)' }}>
          ({items.length})
        </span>
      </h2>

      <ul className="flex flex-col gap-2.5">
        {items.map((item) => {
          const busyHere = busyId === item.id;

          // A bounty receipt: nothing to decide, so no Accept — one button
          // that means "seen". Rendered in this list rather than the
          // notification one because the coin actually landed, and a
          // payment is worth more than a row that scrolls away.
          if (item.type === 'reward_bounty') {
            return (
              <li
                key={item.id}
                className="flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-3"
              >
                <span aria-hidden="true" className="mt-0.5 text-lg leading-none">
                  🪙
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-100">{item.message ?? 'You earned a bounty!'}</p>
                  {errors[item.id] && <p className="mt-1.5 text-xs text-[var(--danger)]">{errors[item.id]}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => run(item, onDecline)}
                  disabled={busyHere}
                  className="shrink-0 self-center rounded-xl border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-200 transition active:scale-[0.97] disabled:opacity-50"
                >
                  Nice!
                </button>
              </li>
            );
          }

          const routine = item.templateData ?? {};
          const exercises = Array.isArray(routine.exercises) ? routine.exercises : [];
          const preview = exercisePreview(exercises);
          const expanded = openId === item.id;
          const busy = busyHere;
          return (
            <li key={item.id} className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-3">
              <p className="text-sm text-neutral-100">
                <span className="font-semibold">{item.senderName ?? 'A friend'}</span> recommended{' '}
                <span className="font-semibold" style={{ color: 'var(--tier-accent)' }}>
                  {routine.title ?? 'a workout'}
                </span>{' '}
                to you!
              </p>

              {/* Their words, marked as theirs. Quoted and italic so a
                  message can never be mistaken for the app talking. */}
              {item.message && <p className="mt-1 text-xs italic text-neutral-400">“{item.message}”</p>}

              {/* The three-name teaser gives way to the real list rather
                  than sitting above it saying the same thing twice. */}
              {preview && !expanded && <p className="mt-1.5 text-xs text-neutral-500">{preview}</p>}

              {/* Look before you commit. Inline rather than a sheet on
                  purpose: the two buttons stay on screen while you read, so
                  checking the routine is part of deciding rather than a
                  detour you have to come back from. */}
              {exercises.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setOpenId((cur) => (cur === item.id ? null : item.id))}
                    aria-expanded={expanded}
                    aria-controls={`routine-${item.id}`}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[var(--ember)] transition active:scale-[0.98]"
                  >
                    {expanded ? 'Hide' : `See all ${exercises.length} exercise${exercises.length === 1 ? '' : 's'}`}
                    <span aria-hidden="true" className="text-[10px] leading-none">
                      {expanded ? '▲' : '▼'}
                    </span>
                  </button>

                  {expanded && (
                    // Scrolls past a handful rather than pushing the
                    // buttons off the card — a template can carry up to 30
                    // exercises. overscroll-contain so flicking the end of
                    // this list does not scroll the whole Social tab.
                    <ol
                      id={`routine-${item.id}`}
                      className="mt-2 flex max-h-48 flex-col gap-1.5 overflow-y-auto overscroll-contain rounded-lg border border-white/5 bg-black/25 px-2.5 py-2"
                    >
                      {exercises.map((exercise, i) => {
                        const group = getMuscleGroup(exercise?.muscleGroup);
                        return (
                          <li
                            key={`${exercise?.exerciseId ?? exercise?.name}-${i}`}
                            className="flex items-center gap-2 text-xs"
                          >
                            <span className="w-3.5 shrink-0 text-right tabular-nums text-neutral-600">{i + 1}</span>
                            <span
                              aria-hidden="true"
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: group?.color ?? 'rgba(255,255,255,0.25)' }}
                            />
                            <span className="min-w-0 flex-1 truncate text-neutral-200">
                              {exercise?.name ?? 'Exercise'}
                            </span>
                            {group && (
                              <span className="shrink-0 text-[10px] uppercase tracking-wide text-neutral-600">
                                {group.label}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </>
              )}

              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => run(item, onAccept)}
                  disabled={busy}
                  className="flex-1 rounded-xl bg-[var(--ember)] py-2.5 text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Accept & Save'}
                </button>
                <button
                  type="button"
                  onClick={() => run(item, onDecline)}
                  disabled={busy}
                  aria-label={`Dismiss ${routine.title ?? 'this workout'}`}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-neutral-400 transition active:scale-[0.97] disabled:opacity-50"
                >
                  Dismiss
                </button>
              </div>

              {errors[item.id] && <p className="mt-1.5 text-xs text-[var(--danger)]">{errors[item.id]}</p>}
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] text-neutral-600">Accepting saves it to your templates. Nothing is shared back.</p>
    </section>
  );
}
