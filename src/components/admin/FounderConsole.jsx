import { useState } from 'react';
import AnalyticsPanel from './AnalyticsPanel';
import EconomyPanel from './EconomyPanel';
import OperationsPanel from './OperationsPanel';
import { MOCK } from './consoleMock';

// The Founder Console: three tabs over one payload (adminAnalytics) and
// three operations (adminOps). Presentational — AdminDashboard.jsx hands
// in the live hooks, dev/admin.jsx a fixture — so the whole screen can be
// looked at without an admin session.
//
// WHAT THIS SCREEN IS NOT. It is not the security boundary. The route is
// gated in App.jsx on the signed-in email, a client-side check anyone can
// defeat on their own device; what they get for it is this chrome and an
// error, because every number and every action goes through a callable
// that re-checks the caller against Auth server-side (functions/
// appAdmin.js).
const TABS = [
  { id: 'analytics', label: 'Analytics', hint: 'Pulse, sharing, retention' },
  { id: 'economy', label: 'Economy & Gamification', hint: 'Mascots, coins, churn' },
  { id: 'operations', label: 'Operations', hint: 'Announce, grant' },
];

function generatedLabel(iso) {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const min = Math.round(ms / 60000);
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
}

export default function FounderConsole({ analytics, ops, initialTab = TABS[0].id }) {
  const [activeId, setActiveId] = useState(initialTab);
  const { data, loading, reload } = analytics;
  // Real when the server sends it, the marked placeholder when it does
  // not (consoleMock.js).
  const virality = data?.virality ?? MOCK.virality;
  const coaching = data?.coaching ?? MOCK.coaching;
  const generated = generatedLabel(data?.generatedAt);

  return (
    <div className="flex flex-col gap-5 pt-6 pb-nav">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Jimmy the Goat · Admin
          </p>
          <h1 className="text-3xl font-bold leading-tight text-neutral-50">Founder Console</h1>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-neutral-500">
          {generated && <span>Updated {generated}</span>}
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="rounded-full border border-white/10 px-3 py-1.5 font-semibold text-neutral-300 transition active:scale-95 disabled:opacity-50"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Console sections"
        className="flex gap-1 self-start rounded-2xl bg-white/[0.05] p-1"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`console-tab-${tab.id}`}
            aria-selected={tab.id === activeId}
            aria-controls={`console-panel-${tab.id}`}
            onClick={() => setActiveId(tab.id)}
            className={`rounded-xl px-3.5 py-2 text-left transition-colors ${tab.id === activeId ? 'text-neutral-950' : 'text-neutral-400'}`}
            style={{ background: tab.id === activeId ? 'var(--tier-accent)' : 'transparent' }}
          >
            <span className="block text-sm font-bold leading-tight">{tab.label}</span>
            <span
              className={`block text-[10px] leading-tight ${tab.id === activeId ? 'text-neutral-900/70' : 'text-neutral-600'}`}
            >
              {tab.hint}
            </span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`console-panel-${activeId}`} aria-labelledby={`console-tab-${activeId}`}>
        {activeId === 'analytics' && <AnalyticsPanel analytics={analytics} virality={virality} coaching={coaching} />}
        {activeId === 'economy' && <EconomyPanel analytics={analytics} />}
        {activeId === 'operations' && <OperationsPanel ops={ops} analytics={analytics} />}
      </div>
    </div>
  );
}
