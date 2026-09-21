import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import PendingVerificationScreen from "../src/components/auth/PendingVerificationScreen";
import { tierCssVars } from "../src/utils/tierTheme";

// The hard email gate on its own — what a signed-in account with an
// unconfirmed address sees instead of the app.
//
// Worth a harness because this screen is otherwise unreachable on
// demand: getting to it for real means holding an account that is signed
// in AND unverified, and its interesting states (a resend that was
// rate-limited, the cooldown counting down, a change-email that
// resolved without sending) are states you cannot ask a live Firebase
// project to produce.
//
//   ?fail=1     every resend throws auth/too-many-requests
//   ?slow=1     resend and recheck take two seconds
//   ?verified=1 the recheck succeeds and the gate lets you through
//
// Dev only — this page is never built.
const params = new URLSearchParams(location.search);
const FAIL = params.get("fail") === "1";
const SLOW = params.get("slow") === "1";
const VERIFIED = params.get("verified") === "1";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Shaped like the real thing so friendlyAuthError maps it, rather than
// falling through to the generic fallback and hiding the copy under test.
const rateLimited = () => {
  const err = new Error("Firebase: Error (auth/too-many-requests).");
  err.code = "auth/too-many-requests";
  return err;
};

function Harness() {
  const [log, setLog] = useState([]);
  const [through, setThrough] = useState(false);
  const note = (line) =>
    setLog((l) => [...l, `${new Date().toLocaleTimeString()} ${line}`]);

  if (through) {
    return (
      <div className="mx-auto max-w-sm px-4 pt-10" style={tierCssVars("titan")}>
        <h1 className="text-xl font-bold text-neutral-50">
          Verified — the app would render here.
        </h1>
        <ul
          id="verify-log"
          className="mt-3 flex flex-col gap-1 text-xs text-neutral-500"
        >
          {log.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <button
          type="button"
          id="verify-reset"
          onClick={() => setThrough(false)}
          className="mt-4 rounded-xl border border-white/10 px-3 py-2 text-sm text-neutral-200"
        >
          Show the gate again
        </button>
      </div>
    );
  }

  return (
    <div style={tierCssVars("titan")}>
      <PendingVerificationScreen
        email="lifter@example.com"
        notice={null}
        onRecheck={async () => {
          note("recheck: reload()");
          await wait(SLOW ? 2000 : 300);
          note(`recheck: emailVerified=${VERIFIED}`);
          if (VERIFIED) setThrough(true);
          return VERIFIED;
        }}
        onResend={async () => {
          note("resend: sendEmailVerification()");
          await wait(SLOW ? 2000 : 300);
          if (FAIL) {
            note("resend: threw auth/too-many-requests");
            throw rateLimited();
          }
          note("resend: sent");
        }}
        onChangeEmail={async (next) => {
          note(`changeEmail: ${next}`);
          await wait(SLOW ? 2000 : 300);
        }}
        onSignOut={() => note("sign out tapped")}
      />
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
