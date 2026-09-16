import { useState } from 'react';

// Phase 2a: "want to keep this lineup?", asked once the celebration is
// over rather than as a toggle buried in the finish screen.
//
// Only shown when there is actually something to save — a session loaded
// from a saved routine or a trainer's assignment already IS a routine, and
// being asked to save a copy of the thing you just opened is the kind of
// prompt people learn to dismiss without reading. App.jsx decides that;
// this component only draws the question.
export default function SaveRoutinePrompt({ defaultName, onSave, onSkip }) {
  const [name, setName] = useState(defaultName);

  const save = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) onSkip();
    else onSave(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-6">
      <form onSubmit={save} className="w-full max-w-xs card p-6 flex flex-col gap-4 text-center">
        <div>
          <p className="text-3xl" aria-hidden="true">
            📋
          </p>
          <p className="text-lg font-bold text-neutral-50 mt-2">Save this as a routine?</p>
          <p className="text-sm text-neutral-500 mt-1">
            Load the same lineup next time instead of building it again.
          </p>
        </div>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Routine name"
          maxLength={40}
          aria-label="Routine name"
          className="w-full bg-neutral-900 rounded-xl px-3.5 py-3 text-base text-neutral-100 focus:outline-none focus:ring-2"
          style={{ '--tw-ring-color': 'var(--tier-accent)' }}
        />

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            className="w-full bg-[var(--ember)] text-white font-semibold text-base py-3.5 rounded-2xl active:scale-[0.97] transition"
          >
            Save Routine
          </button>
          <button type="button" onClick={onSkip} className="w-full text-neutral-400 font-medium text-base py-2">
            No thanks
          </button>
        </div>
      </form>
    </div>
  );
}
