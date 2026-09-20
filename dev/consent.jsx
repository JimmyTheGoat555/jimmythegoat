import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import LegalConsentGate from '../src/components/auth/LegalConsentGate';
import { tierCssVars } from '../src/utils/tierTheme';

// The Terms / Privacy consent gate on its own — what a signed-in account
// that has not accepted the current LEGAL_VERSION sees instead of the app.
//
//   ?slow=1   the accept write takes two seconds (the Saving… state)
//
// Dev only — this page is never built.
const params = new URLSearchParams(location.search);
const SLOW = params.get('slow') === '1';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function Harness() {
  const [log, setLog] = useState([]);
  const [done, setDone] = useState(false);
  const note = (line) => setLog((l) => [...l, `${new Date().toLocaleTimeString()} ${line}`]);
  if (done) {
    return (
      <div className="mx-auto max-w-sm px-4 pt-10" style={tierCssVars('titan')}>
        <h1 className="text-xl font-bold text-neutral-50">Accepted — the app would render here.</h1>
        <ul id="consent-log" className="mt-3 flex flex-col gap-1 text-xs text-neutral-500">
          {log.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <button
          type="button"
          id="consent-reset"
          onClick={() => setDone(false)}
          className="mt-4 rounded-xl border border-white/10 px-3 py-2 text-sm text-neutral-200"
        >
          Show the gate again
        </button>
      </div>
    );
  }
  return (
    <div style={tierCssVars('titan')}>
      <LegalConsentGate
        onAccept={async () => {
          note('accept: write started');
          await wait(SLOW ? 2000 : 300);
          note('accept: write landed');
          setDone(true);
        }}
        onSignOut={() => note('sign out tapped')}
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
