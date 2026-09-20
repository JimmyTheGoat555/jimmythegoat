import { BarRow, Empty, Metric, Panel, Stat, fmt } from './consoleUi';

const TABLE_ROWS = 20;

// Tab 1 — Analytics & Engagement. The live pulse, virality, retention,
// the content system, then the reference layer and the Power Users
// table that were the whole dashboard before the console existed.
//
// Presentational: `analytics` is useAdminAnalytics()'s state, handed in
// by FounderConsole so the harness (dev/admin.jsx) can feed a fixture.

const STAGE_LABELS = { 1: 'Goat', 2: 'Buff', 3: 'Titan', 4: 'Legend' };

function StageLadder({ byStage, total }) {
  if (!byStage?.length) return <Empty>No ladder yet.</Empty>;
  const peak = Math.max(1, ...byStage.map((s) => s.count));
  return (
    <div className="flex flex-col gap-2.5">
      {byStage.map(({ stage, count }) => (
        <BarRow
          key={stage}
          label={STAGE_LABELS[stage] ?? `Stage ${stage}`}
          value={count}
          max={peak}
          sub={total ? `${Math.round((count / total) * 100)}%` : undefined}
        />
      ))}
    </div>
  );
}

function SortPill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${active ? 'text-neutral-950' : 'text-neutral-400'}`}
      style={{ background: active ? 'var(--tier-accent)' : 'rgba(255,255,255,0.08)' }}
    >
      {children}
    </button>
  );
}

function sinceLabel(iso) {
  if (!iso) return '—';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(days / 365)}y ago`;
}

const TH = 'text-left text-[10px] uppercase tracking-wider text-neutral-500 font-semibold px-3 py-2 whitespace-nowrap';
const TD = 'px-3 py-2.5 text-sm text-neutral-200 whitespace-nowrap';

export default function AnalyticsPanel({ analytics, virality, coaching }) {
  const { data, loading, error, reload, sortBy, setSortBy } = analytics;
  const totals = data?.totals ?? {};
  const errors = data?.errors ?? {};
  const pulse = data?.pulse ?? {};
  const engagement = data?.engagement ?? {};
  // The payload carries up to 50 rows (they double as the God-mode search
  // directory — AdminDashboard.jsx); the table is a top-20.
  const rows = (data?.powerUsers ?? []).slice(0, TABLE_ROWS);

  if (error) {
    return (
      <Panel>
        <p className="text-center text-sm text-[var(--danger)]">{error}</p>
        <button type="button" onClick={reload} className="text-center text-xs text-neutral-400 underline">
          Try again
        </button>
      </Panel>
    );
  }

  const topTheme = [...(virality?.themes ?? [])].sort((a, b) => b.shares - a.shares)[0] ?? null;
  const themePeak = Math.max(1, ...(virality?.themes ?? []).map((t) => t.shares));
  const exercisePeak = Math.max(1, ...(engagement.topExercises ?? []).map((e) => e.sessions));

  return (
    <div className="flex flex-col gap-4">
      {/* ── Live pulse ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Live pulse"
          value={pulse.activeLastHour}
          unit="lifting"
          error={errors.pulse}
          loading={loading}
          tone="good"
          hint="Finished a session in the last 60 min — sessions in progress live on the phone until they end"
        />
        <Metric
          label="Active today"
          value={pulse.activeLastDay}
          error={errors.dauMau}
          loading={loading}
          hint="Logged a session in the last 24 h"
        />
        <Metric
          label="Active (7 days)"
          value={totals.activeLast7Days}
          error={errors.activeLast7Days}
          loading={loading}
          hint={
            totals.users
              ? `${Math.round(((totals.activeLast7Days ?? 0) / totals.users) * 100)}% of live accounts`
              : undefined
          }
        />
        <Metric
          label="Live users"
          value={totals.users}
          error={errors.users}
          loading={loading}
          hint={
            totals.orphanedDocs
              ? `+${fmt(totals.orphanedDocs)} deleted account${totals.orphanedDocs === 1 ? '' : 's'} excluded`
              : 'Auth accounts, not stale docs'
          }
        />
      </div>

      {/* ── Virality & engagement ──────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel eyebrow="Virality & sharing" title="Stickers out the door" aside={virality?.mock ? <MockAside /> : null}>
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="Total sticker shares"
              value={virality?.totalStickerShares}
              mock={virality?.mock}
              loading={loading && !virality}
              hint={virality ? `${fmt(virality.last7Days)} this week` : undefined}
            />
            <Metric
              label="Most popular theme"
              value={topTheme?.name ?? '—'}
              mock={virality?.mock}
              loading={loading && !virality}
              hint={
                topTheme && virality
                  ? `${Math.round((topTheme.shares / Math.max(1, virality.totalStickerShares)) * 100)}% of all shares`
                  : undefined
              }
              tone="plain"
            />
          </div>
          <div className="flex flex-col gap-2">
            {(virality?.themes ?? []).slice(0, 5).map((t) => (
              <BarRow key={t.id} label={t.name} value={t.shares} max={themePeak} />
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Engagement" title="Are they coming back?">
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="Workouts / week"
              value={engagement.avgWorkoutsPerWeek}
              digits={1}
              unit="avg"
              error={errors.powerUsers}
              loading={loading}
              hint="Per account that has trained, since signup"
            />
            <Metric
              label="Workout duration"
              value={engagement.avgWorkoutDurationMin}
              unit="min avg"
              error={errors.engagement}
              loading={loading}
              hint={engagement.sampleSize ? `From a sample of ${fmt(engagement.sampleSize)} sessions` : undefined}
            />
          </div>
          <div className="px-1">
            <Stat label="Workouts logged" value={totals.workouts} />
            <Stat
              label="Shared to the feed"
              value={totals.feedPosts}
              hint={totals.workouts ? `${Math.round(((totals.feedPosts ?? 0) / totals.workouts) * 100)}%` : undefined}
            />
            <Stat label="On a streak" value={totals.onStreak} hint="2+ sessions" />
            <Stat label="Never trained" value={totals.neverTrained} />
          </div>
        </Panel>
      </div>

      {/* ── Content system ─────────────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel eyebrow="Content system" title="Top 5 most logged exercises">
          {errors.engagement ? (
            <Empty>Unavailable — {errors.engagement}</Empty>
          ) : (engagement.topExercises ?? []).length === 0 ? (
            <Empty>{loading ? 'Loading…' : 'No sessions sampled yet.'}</Empty>
          ) : (
            <div className="flex flex-col gap-2.5">
              {engagement.topExercises.map((e, i) => (
                <BarRow key={e.id} label={`${i + 1}. ${e.name}`} value={e.sessions} max={exercisePeak} sub="sessions" />
              ))}
            </div>
          )}
        </Panel>
        <Panel eyebrow="Content system" title="Overload coaching" aside={coaching?.mock ? <MockAside /> : null}>
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="Coaching triggers"
              value={coaching?.overloadTriggers}
              mock={coaching?.mock}
              loading={loading && !coaching}
              hint="Times the “past 12 reps” toast was shown"
            />
            <Metric
              label="This week"
              value={coaching?.last7Days}
              mock={coaching?.mock}
              loading={loading && !coaching}
              hint={coaching ? `≈ ${fmt(coaching.perHundredSessions)} per 100 sessions` : undefined}
            />
          </div>
        </Panel>
      </div>

      {/* ── Reference layer ────────────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel eyebrow="Growth & reach">
          <div>
            <Stat label="New this week" value={totals.newLast7Days} />
            <Stat label="Signed in this week" value={totals.signedInLast7Days} />
            <Stat
              label="Email verified"
              value={totals.emailVerified}
              hint={totals.users ? `of ${totals.users}` : undefined}
            />
            {totals.disabled ? <Stat label="Disabled accounts" value={totals.disabled} /> : null}
          </div>
        </Panel>
        <Panel eyebrow="Roles & sharing">
          <div>
            <Stat label="Trainers" value={totals.trainers} />
            <Stat label="Coached by a trainer" value={totals.withTrainer} />
            <Stat label="Sharing PRs publicly" value={totals.sharingPRs} />
            <Stat label="Lifetime volume, all users" value={totals.totalVolume} hint="RSV" />
          </div>
        </Panel>
        <Panel eyebrow="Evolution ladder" title="Head-count per stage">
          <StageLadder byStage={totals.byStage} total={totals.users} />
        </Panel>
      </div>

      {/* ── Power users ────────────────────────────────────────────── */}
      <Panel
        eyebrow="Power users"
        title="Who is carrying the app"
        aside={
          <div className="flex items-center gap-1.5">
            <SortPill active={sortBy === 'workouts'} onClick={() => setSortBy('workouts')}>
              Workouts
            </SortPill>
            <SortPill active={sortBy === 'volume'} onClick={() => setSortBy('volume')}>
              Volume
            </SortPill>
          </div>
        }
      >
        {errors.powerUsers ? (
          <Empty>Leaderboard unavailable — {errors.powerUsers}</Empty>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  {[
                    '#',
                    'Lifter',
                    'Goat',
                    'Tier',
                    'Workouts',
                    'Volume',
                    'Streak',
                    'Coins',
                    'Friends',
                    'Last workout',
                    'Joined',
                    'Last seen',
                  ].map((h) => (
                    <th key={h} className={TH} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 && (
                  <tr>
                    <td className={`${TD} text-neutral-500`} colSpan={12}>
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td className={`${TD} text-neutral-500`} colSpan={12}>
                      No accounts yet.
                    </td>
                  </tr>
                )}
                {rows.map((u, i) => (
                  <tr key={u.uid} className="border-b border-white/5 last:border-0">
                    <td className={`${TD} tabular-nums text-neutral-500`}>{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <p className="text-sm font-semibold leading-tight text-neutral-100">
                        {u.displayName}
                        {u.role === 'trainer' && (
                          <span className="ml-1.5 align-middle text-[9px] uppercase tracking-wider text-neutral-500">
                            Trainer
                          </span>
                        )}
                      </p>
                      {u.email ? (
                        <span className="flex items-center gap-1.5">
                          <a
                            href={`mailto:${u.email}`}
                            className="text-xs text-neutral-500 underline decoration-dotted underline-offset-2"
                          >
                            {u.email}
                          </a>
                          {!u.emailVerified && (
                            <span
                              title="Email never confirmed — mail may not reach them"
                              className="text-[9px] uppercase tracking-wider text-amber-500/80"
                            >
                              unverified
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-600">no email on file</span>
                      )}
                    </td>
                    <td className={`${TD} capitalize text-neutral-400`}>{u.mascot ?? '—'}</td>
                    <td className={`${TD} text-neutral-400`}>{u.tier ?? '—'}</td>
                    <td className={`${TD} font-semibold tabular-nums`}>{fmt(u.workouts)}</td>
                    <td className={`${TD} tabular-nums`}>{fmt(u.volume)}</td>
                    <td className={`${TD} tabular-nums`}>{u.currentStreak > 0 ? `🔥 ${u.currentStreak}` : '—'}</td>
                    <td className={`${TD} tabular-nums`}>{fmt(u.coins)}</td>
                    <td className={`${TD} tabular-nums text-neutral-400`}>{u.friends ?? 0}</td>
                    <td className={`${TD} text-neutral-400`}>{sinceLabel(u.lastWorkoutAt)}</td>
                    <td className={`${TD} text-neutral-400`}>{sinceLabel(u.createdAt)}</td>
                    <td className={`${TD} text-neutral-400`}>{sinceLabel(u.lastSignInAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-neutral-500">
          <p>Volume = lifetime Relative Strength Volume, not kg.</p>
          <button type="button" onClick={reload} disabled={loading} className="underline disabled:opacity-50">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {data?.truncated && (
          <p className="text-[11px] text-[var(--danger)]">
            Ranked from the first {fmt(data.scanned)} accounts only — the counters above are still exact.
          </p>
        )}
      </Panel>
    </div>
  );
}

function MockAside() {
  return <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">placeholder data</span>;
}
