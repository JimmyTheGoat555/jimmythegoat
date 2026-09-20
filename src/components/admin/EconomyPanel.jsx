import { BarRow, Empty, Metric, Panel, Stat, fmt } from './consoleUi';

// Tab 2 — Economy & Gamification. Who wears which goat and how far each
// gets (the check on the female ladder scale — utils/evolutionTiers.js),
// the coin float against the sinks, and where on the ladder people stop.

const STAGE_LABELS = { 1: 'Goat', 2: 'Buff', 3: 'Titan', 4: 'Legend' };
const MASCOT_LABELS = { jimmy: 'Jimmy', gena: 'Gena' };
const MASCOT_COLORS = { jimmy: 'var(--tier-accent)', gena: '#f472b6' };

export default function EconomyPanel({ analytics }) {
  const { data, loading } = analytics;
  const errors = data?.errors ?? {};
  const gamification = data?.gamification ?? {};
  const economy = data?.economy ?? {};
  const pulse = data?.pulse ?? {};
  const split = gamification.mascotSplit;
  const splitTotal = split ? split.jimmy + split.gena : 0;
  const byMascot = gamification.avgStageByMascot ?? [];
  const dropOff = gamification.dropOff ?? [];
  const worst = dropOff.reduce((m, s) => (s.rate != null && (m == null || s.rate > m.rate) ? s : m), null);
  const earnedVsSpent =
    economy.coinsEarned && economy.coinsSpent != null ? economy.coinsSpent / economy.coinsEarned : null;
  const shopPeak = Math.max(1, ...(economy.topShopItems ?? []).map((i) => i.owners));

  return (
    <div className="flex flex-col gap-4">
      {/* ── Demographics ───────────────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel eyebrow="Demographics" title="Mascot split">
          {!split ? (
            <Empty>
              {errors.powerUsers ? `Unavailable — ${errors.powerUsers}` : loading ? 'Loading…' : 'No accounts yet.'}
            </Empty>
          ) : (
            <>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/5">
                {['jimmy', 'gena'].map((m) => (
                  <div
                    key={m}
                    className="h-full transition-[width] duration-500"
                    style={{
                      width: `${splitTotal ? (split[m] / splitTotal) * 100 : 0}%`,
                      background: MASCOT_COLORS[m],
                    }}
                    title={`${MASCOT_LABELS[m]} ${split[m]}`}
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {['jimmy', 'gena'].map((m) => (
                  <div key={m} className="flex items-baseline gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: MASCOT_COLORS[m] }} />
                    <span className="text-sm font-semibold text-neutral-100">{MASCOT_LABELS[m]}</span>
                    <span className="text-sm tabular-nums text-neutral-300">{fmt(split[m])}</span>
                    <span className="text-xs text-neutral-500">
                      {splitTotal ? `${Math.round((split[m] / splitTotal) * 100)}%` : ''}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-neutral-500">
                Ratio {split.gena ? `${fmt(split.jimmy / split.gena, 2)} : 1` : `${fmt(split.jimmy)} : 0`} Jimmy to
                Gena, live accounts.
              </p>
            </>
          )}
        </Panel>

        <Panel eyebrow="Demographics" title="Average level by mascot">
          {byMascot.length === 0 ? (
            <Empty>{loading ? 'Loading…' : 'No accounts yet.'}</Empty>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                {byMascot.map((row) => (
                  <Metric
                    key={row.mascot}
                    label={`${MASCOT_LABELS[row.mascot] ?? row.mascot} · avg stage`}
                    value={row.avgStageTrained ?? row.avgStage}
                    digits={2}
                    unit="/ 4"
                    loading={loading}
                    hint={`${fmt(row.trained)} trained of ${fmt(row.count)} · all accounts ${fmt(row.avgStage, 2)}`}
                    tone={row.mascot === 'gena' ? 'plain' : 'accent'}
                  />
                ))}
              </div>
              <p className="text-[10px] leading-snug text-neutral-500">
                Trained accounts only, so an account that never logged a session does not drag its character down. The
                two should sit close together: that is what the 0.65 threshold scale on the Gena ladder is for.
              </p>
            </>
          )}
        </Panel>
      </div>

      {/* ── Economy sinks ──────────────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-5">
        <div className="grid grid-cols-2 gap-3 lg:col-span-3 lg:grid-cols-2">
          <Metric
            label="Coins earned"
            value={economy.coinsEarned}
            error={errors.coinsEarned}
            loading={loading}
            hint="Paid out by every logged workout, all time"
          />
          <Metric
            label="Coins spent"
            value={economy.coinsSpent}
            error={errors.powerUsers}
            loading={loading}
            hint="Everything bought, at today's catalog prices"
          />
          <Metric
            label="Spent ÷ earned"
            value={earnedVsSpent}
            digits={2}
            loading={loading}
            hint={
              earnedVsSpent != null
                ? `${Math.round(earnedVsSpent * 100)}% of the payout has been sunk`
                : 'Needs both figures'
            }
            tone="good"
          />
          <Metric
            label="In circulation"
            value={economy.coinsInCirculation}
            error={errors.users}
            loading={loading}
            hint="Held by live accounts right now"
          />
        </div>
        <Panel eyebrow="Economy sinks" title="Top shop items" className="lg:col-span-2">
          {(economy.topShopItems ?? []).length === 0 ? (
            <Empty>{loading ? 'Loading…' : 'Nothing bought yet.'}</Empty>
          ) : (
            <div className="flex flex-col gap-2.5">
              {economy.topShopItems.map((item) => (
                <BarRow
                  key={item.id}
                  label={`${item.emoji} ${item.name}`}
                  value={item.owners}
                  max={shopPeak}
                  sub={`${fmt(item.cost)}c`}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ── Churn ──────────────────────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-5">
        <Panel eyebrow="Churn analysis" title="Death Valley — where lifters stop" className="lg:col-span-3">
          {dropOff.length === 0 ? (
            <Empty>{loading ? 'Loading…' : 'No trained accounts yet.'}</Empty>
          ) : (
            <>
              <div className="flex flex-col gap-2.5">
                {dropOff.map((s) => (
                  <BarRow
                    key={s.stage}
                    label={STAGE_LABELS[s.stage] ?? `Stage ${s.stage}`}
                    value={s.rate != null ? s.rate * 100 : 0}
                    max={100}
                    display={s.rate != null ? `${Math.round(s.rate * 100)}%` : '—'}
                    sub={`${fmt(s.dormant)} of ${fmt(s.lifters)}`}
                    color={worst && s.stage === worst.stage && s.dormant > 0 ? 'var(--danger)' : 'var(--tier-accent)'}
                  />
                ))}
              </div>
              <p className="text-[10px] leading-snug text-neutral-500">
                Share of the lifters at each stage who have gone {gamification.dormantDays ?? 14}+ days without a
                session.
                {worst && worst.dormant > 0 ? ` The valley is ${STAGE_LABELS[worst.stage]}.` : ''}
              </p>
            </>
          )}
        </Panel>
        <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-1">
          <Metric
            label="DAU / MAU"
            value={pulse.dauMau}
            digits={2}
            error={errors.dauMau}
            loading={loading}
            hint={
              pulse.activeLastDay != null
                ? `${fmt(pulse.activeLastDay)} today ÷ ${fmt(pulse.activeLast30Days)} this month`
                : undefined
            }
            tone="good"
          />
          <div
            className={`flex flex-col justify-center rounded-2xl border border-white/[0.07] bg-white/[0.035] px-4 py-3`}
          >
            <Stat label="Active (30 days)" value={pulse.activeLast30Days} />
            <Stat label="Active (24 h)" value={pulse.activeLastDay} />
          </div>
        </div>
      </div>
    </div>
  );
}
