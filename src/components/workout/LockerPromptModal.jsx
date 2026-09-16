import { useState } from 'react';

// Asked once, at the top of a session, before the first set is logged.
//
// The problem it solves is mundane and universal: you put your phone, keys
// and bag in a locker, spin the dial, and ninety minutes of squats later
// the number is gone. The app already owns the two moments that bracket
// that gap — workout start and workout finish — so it is the only thing in
// the gym that can hand the number back at exactly the right time.
//
// Three exits, and the difference between the last two matters:
//   • Save & Start        — a number for THIS session.
//   • I don't have a locker — no number for THIS session. Home workout,
//     outdoor run, a gym with open shelves. Asked again next time.
//   • Don't show this again — turn the feature off for the ACCOUNT.
// Collapsing those two into one flag (the original sketch) meant a single
// session in the garage silently killed the feature forever, with no
// visible cause and nothing to undo. They are kept apart, and the
// account-level one is reversible from Settings → "Ask for Locker Number".
export default function LockerPromptModal({ onSave, onSkip, onDisable }) {
  const [value, setValue] = useState('');

  const save = (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    // An empty "Save" is the same answer as "no locker" — no point
    // rejecting it and standing between someone and their warm-up.
    if (!trimmed) onSkip();
    else onSave(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
      <form onSubmit={save} className="w-full max-w-xs card p-5 flex flex-col gap-4 text-center">
        <div>
          <p className="text-3xl" aria-hidden="true">
            🔐
          </p>
          <p className="text-lg font-bold text-neutral-50 mt-2">What is your locker number today?</p>
          <p className="text-sm text-neutral-500 mt-1">
            Jimmy will remind you when you finish, so you don't leave your stuff behind.
          </p>
        </div>

        {/* inputMode="numeric" rather than type="number": this is a label,
            not a quantity — it never needs spinners, and some locker tags
            are "B12" or have a leading zero that type="number" eats. The
            keypad is the only part worth borrowing. */}
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          maxLength={8}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 42"
          aria-label="Locker number"
          className="w-full bg-black/30 border border-white/10 rounded-2xl text-center text-2xl font-bold text-neutral-50 py-3 tracking-widest placeholder:text-neutral-600 placeholder:tracking-normal placeholder:text-base placeholder:font-normal"
        />

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            className="w-full bg-[var(--ember)] text-white font-semibold text-base py-3.5 rounded-2xl active:scale-[0.97] transition"
          >
            Save &amp; Start
          </button>
          <button type="button" onClick={onSkip} className="w-full text-neutral-400 font-medium text-base py-2">
            I don't have a locker
          </button>
          <button type="button" onClick={onDisable} className="w-full text-neutral-600 text-xs py-1">
            Don't show this again
          </button>
        </div>
      </form>
    </div>
  );
}
