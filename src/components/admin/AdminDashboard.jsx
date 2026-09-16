import { useState } from 'react';
import AnalyticsPanel from './AnalyticsPanel';

// The Admin section's shell: a header, a tab strip, and whichever panel is
// selected.
//
// ON THE SECOND TAB. This was asked for as "a tab to switch between this
// dashboard and the Exercise Moderation screen we built previously" —
// there is no such screen in this codebase, and there is nothing for it to
// moderate either: custom exercises are created by useExercises into
// localStorage under `custom-exercises:{uid}` and never reach Firestore at
// all, so no other user can ever see one. Rather than invent a screen or
// fake a queue, the shell below is built to take a second panel the moment
// one exists — add it to TABS and nothing else changes — and the strip
// hides itself while there is only one, because a segmented control with a
// single segment reads as broken rather than as future-proof.
//
// WHAT THIS SCREEN IS NOT. It is not the security boundary. The route is
// gated in App.jsx on the signed-in email, which is a client-side check
// anyone can defeat on their own device; what they get for defeating it is
// this chrome and an error, because every number below comes from the
// `adminAnalytics` callable, which re-checks the caller against Auth
// server-side (functions/appAdmin.js).
const TABS = [{ id: 'analytics', label: 'Analytics', render: () => <AnalyticsPanel /> }];

export default function AdminDashboard() {
  const [activeId, setActiveId] = useState(TABS[0].id);
  const active = TABS.find((t) => t.id === activeId) ?? TABS[0];

  return (
    <div className="flex flex-col gap-5 pt-6 pb-nav">
      <div>
        <p className="text-neutral-500 text-sm uppercase tracking-wider">Admin</p>
        <h1 className="text-3xl font-bold text-neutral-50">App Health</h1>
      </div>

      {TABS.length > 1 && (
        <div
          role="tablist"
          aria-label="Admin sections"
          className="flex gap-1 p-1 rounded-full self-start"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === activeId}
              onClick={() => setActiveId(tab.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                tab.id === activeId ? 'text-neutral-950' : 'text-neutral-400'
              }`}
              style={{ background: tab.id === activeId ? 'var(--tier-accent)' : 'transparent' }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {active.render()}
    </div>
  );
}
