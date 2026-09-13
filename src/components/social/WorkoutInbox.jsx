import { useState } from 'react';

// Workouts friends have sent you, waiting on a yes or no.
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
        Workout inbox
        <span className="ml-1.5 text-sm" style={{ color: 'var(--tier-accent)' }}>
          ({items.length})
        </span>
      </h2>

      <ul className="flex flex-col gap-2.5">
        {items.map((item) => {
          const routine = item.templateData ?? {};
          const exercises = Array.isArray(routine.exercises) ? routine.exercises : [];
          const preview = exercisePreview(exercises);
          const busy = busyId === item.id;
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

              {preview && <p className="mt-1.5 text-xs text-neutral-500">{preview}</p>}

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
