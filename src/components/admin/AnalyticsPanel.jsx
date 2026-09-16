import { useAdminAnalytics } from '../../hooks/useAdminAnalytics';

// A big number and what it means. `error` wins over `value`, and both win
// over the loading dash — a card that shows a confident 0 when the query
// behind it actually failed is the one failure mode a health dashboard
// must not have (see adminAnalytics.js's per-metric `errors`).
function MetricCard({ label, value, hint, error, loading }) {
  return (
    <div className="card p-4 flex flex-col justify-between min-h-[92px]">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
      {error ? (
        <p className="text-xs text-[var(--danger)] mt-1 leading-snug" title={error}>
          Unavailable
        </p>
      ) : (
        <p
          className="text-3xl font-extrabold tabular-nums leading-none mt-1"
          style={{ color: 'var(--tier-accent)' }}
        >
          {loading || value == null ? '—' : value.toLocaleString('en-US')}
        </p>
      )}
      {hint && !error && <p className="text-[10px] text-neutral-500 mt-1.5">{hint}</p>}
    </div>
  );
}

// A compact label/value pair for the second row of stats. Deliberately not
// another MetricCard: twenty big-number tiles would flatten the hierarchy
// and bury the four numbers that actually lead. These are reference
// figures you look up, not headlines.
function Stat({ label, value, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2 border-b border-white/5 last:border-0">
      <span className="text-xs text-neutral-400">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-neutral-100">
        {value == null ? '—' : value.toLocaleString('en-US')}
        {hint && <span className="ml-1.5 text-[10px] font-normal text-neutral-500">{hint}</span>}
      </span>
    </div>
  );
}

// The evolution ladder as a head-count per stage. The single most useful
// shape on a progression app's health screen: a base that never leaves
// stage 1 is a different problem from one that stalls at stage 3, and a
// total alone cannot tell those apart.
const STAGE_LABELS = { 1: 'Goat', 2: 'Buff', 3: 'Titan', 4: 'Legend' };

function StageLadder({ byStage, total }) {
  if (!byStage?.length) return null;
  const peak = Math.max(1, ...byStage.map((s) => s.count));
  return (
    <div className="card p-4 flex flex-col gap-2.5">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">Evolution ladder</p>
      {byStage.map(({ stage, count }) => (
        <div key={stage} className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-xs text-neutral-400">{STAGE_LABELS[stage] ?? `Stage ${stage}`}</span>
          <div className="h-2 flex-1 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(count / peak) * 100}%`, background: 'var(--tier-accent)' }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-xs tabular-nums text-neutral-300">
            {count.toLocaleString('en-US')}
            {total ? <span className="text-neutral-600"> · {Math.round((count / total) * 100)}%</span> : null}
          </span>
        </div>
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
      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
        active ? 'text-neutral-950' : 'text-neutral-400'
      }`}
      style={{ background: active ? 'var(--tier-accent)' : 'rgba(255,255,255,0.08)' }}
    >
      {children}
    </button>
  );
}

// "3d" / "just now" / "—". Deliberately coarse: on this screen the
// question is "is this person still around", not what time they trained.
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

export default function AnalyticsPanel() {
  const { data, loading, error, reload, sortBy, setSortBy } = useAdminAnalytics();

  const totals = data?.totals ?? {};
  const errors = data?.errors ?? {};
  const rows = data?.powerUsers ?? [];

  if (error) {
    return (
      <div className="card p-5 text-center flex flex-col gap-3">
        <p className="text-sm text-[var(--danger)]">{error}</p>
        <button type="button" onClick={reload} className="text-xs text-neutral-400 underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Live Users"
          value={totals.users}
          error={errors.users}
          loading={loading}
          // The gap between live accounts and user documents is the number
          // of Firestore records whose Auth account is gone — a console
          // deletion leaves everything but the login behind. Silent when
          // there are none, so a clean database says nothing.
          hint={
            totals.orphanedDocs
              ? `+${totals.orphanedDocs.toLocaleString('en-US')} deleted account${totals.orphanedDocs === 1 ? '' : 's'} excluded`
              : 'Auth accounts, not stale docs'
          }
        />
        <MetricCard
          label="Workouts Logged"
          value={totals.workouts}
          error={errors.workouts}
          loading={loading}
          hint={
            totals.feedPosts == null ? undefined : `${totals.feedPosts.toLocaleString('en-US')} shared to feed`
          }
        />
        <MetricCard
          label="Coins in Circulation"
          value={totals.coins}
          error={errors.coins}
          loading={loading}
          hint="Held by live accounts"
        />
        <MetricCard
          label="Active (7 days)"
          value={totals.activeLast7Days}
          error={errors.activeLast7Days}
          loading={loading}
          hint={
            totals.users ? `${Math.round(((totals.activeLast7Days ?? 0) / totals.users) * 100)}% of accounts` : undefined
          }
        />
      </section>

      {/* The reference layer. Everything here is derived from the same
          scanned, Auth-verified population as the cards above, so no two
          numbers on this screen describe different groups of people. */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="card py-1">
          <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-neutral-500">Growth &amp; reach</p>
          <Stat label="New this week" value={totals.newLast7Days} />
          <Stat label="Signed in this week" value={totals.signedInLast7Days} />
          <Stat
            label="Email verified"
            value={totals.emailVerified}
            hint={totals.users ? `of ${totals.users}` : undefined}
          />
          <Stat label="Never trained" value={totals.neverTrained} />
          <Stat label="On a streak" value={totals.onStreak} hint="2+ sessions" />
        </div>
        <div className="card py-1">
          <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-neutral-500">Roles &amp; sharing</p>
          <Stat label="Trainers" value={totals.trainers} />
          <Stat label="Coached by a trainer" value={totals.withTrainer} />
          <Stat label="Sharing PRs publicly" value={totals.sharingPRs} />
          <Stat label="Lifetime volume, all users" value={totals.totalVolume} hint="RSV" />
          {/* Only ever drawn when it is non-zero: a disabled account is
              news, and "Disabled 0" is a row that earns nothing. */}
          {totals.disabled ? <Stat label="Disabled accounts" value={totals.disabled} /> : null}
        </div>
      </section>

      <StageLadder byStage={totals.byStage} total={totals.users} />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-base font-bold text-neutral-50">Power Users</h3>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 mr-1">Rank by</span>
            <SortPill active={sortBy === 'workouts'} onClick={() => setSortBy('workouts')}>
              Workouts
            </SortPill>
            <SortPill active={sortBy === 'volume'} onClick={() => setSortBy('volume')}>
              Volume
            </SortPill>
          </div>
        </div>

        {errors.powerUsers ? (
          <div className="card p-5 text-center">
            <p className="text-sm text-[var(--danger)]">Leaderboard unavailable</p>
            <p className="text-xs text-neutral-500 mt-1">{errors.powerUsers}</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            {/* The only element on this screen allowed to be wider than the
                viewport, and only inside its own scroller — seven columns
                do not fit a phone, and squeezing them would cost the email
                address, which is the column the whole table exists for. */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className={TH} scope="col">
                      #
                    </th>
                    <th className={TH} scope="col">
                      Lifter
                    </th>
                    <th className={TH} scope="col">
                      Tier
                    </th>
                    <th className={TH} scope="col">
                      Workouts
                    </th>
                    <th className={TH} scope="col">
                      Volume
                    </th>
                    <th className={TH} scope="col">
                      Streak
                    </th>
                    <th className={TH} scope="col">
                      Coins
                    </th>
                    <th className={TH} scope="col">
                      Friends
                    </th>
                    <th className={TH} scope="col">
                      Last Workout
                    </th>
                    <th className={TH} scope="col">
                      Joined
                    </th>
                    <th className={TH} scope="col">
                      Last Seen
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0 && (
                    <tr>
                      <td className={`${TD} text-neutral-500`} colSpan={11}>
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td className={`${TD} text-neutral-500`} colSpan={11}>
                        No accounts yet.
                      </td>
                    </tr>
                  )}
                  {rows.map((u, i) => (
                    <tr key={u.uid} className="border-b border-white/5 last:border-0">
                      <td className={`${TD} text-neutral-500 tabular-nums`}>{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <p className="text-sm text-neutral-100 font-semibold leading-tight">
                          {u.displayName}
                          {u.role === 'trainer' && (
                            <span className="ml-1.5 text-[9px] uppercase tracking-wider text-neutral-500 align-middle">
                              Trainer
                            </span>
                          )}
                        </p>
                        {/* A mailto rather than plain text: the stated
                            reason this column exists is reaching people for
                            feedback, and a tap should start that. */}
                        {u.email ? (
                          <span className="flex items-center gap-1.5">
                            <a
                              href={`mailto:${u.email}`}
                              className="text-xs text-neutral-500 underline decoration-dotted underline-offset-2"
                            >
                              {u.email}
                            </a>
                            {/* Straight from the Auth record, not the user
                                doc. Most accounts in this app are
                                unverified by design (the verification gate
                                was removed — see functions/guards.js), so
                                this is a fact about deliverability, not a
                                problem to fix. */}
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
                      <td className={`${TD} text-neutral-400`}>{u.tier ?? '—'}</td>
                      <td className={`${TD} tabular-nums font-semibold`}>{u.workouts.toLocaleString('en-US')}</td>
                      <td className={`${TD} tabular-nums`}>{u.volume.toLocaleString('en-US')}</td>
                      <td className={`${TD} tabular-nums`}>{u.currentStreak > 0 ? `🔥 ${u.currentStreak}` : '—'}</td>
                      <td className={`${TD} tabular-nums`}>{u.coins.toLocaleString('en-US')}</td>
                      <td className={`${TD} tabular-nums text-neutral-400`}>{u.friends ?? 0}</td>
                      <td className={`${TD} text-neutral-400`}>{sinceLabel(u.lastWorkoutAt)}</td>
                      <td className={`${TD} text-neutral-400`}>{sinceLabel(u.createdAt)}</td>
                      <td className={`${TD} text-neutral-400`}>{sinceLabel(u.lastSignInAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap text-[11px] text-neutral-500">
          {/* Volume is the app's Relative Strength Volume, not kilograms
              (functions/records.js). Saying so costs one line and stops
              these numbers reading as absurd tonnage. */}
          <p>Volume = lifetime Relative Strength Volume, not kg.</p>
          <button type="button" onClick={reload} disabled={loading} className="underline disabled:opacity-50">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {data?.truncated && (
          <p className="text-[11px] text-[var(--danger)]">
            Ranked from the first {data.scanned.toLocaleString('en-US')} accounts only — the counters above are
            still exact.
          </p>
        )}
      </section>
    </div>
  );
}
