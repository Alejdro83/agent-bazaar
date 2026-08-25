'use client';

/**
 * Visual breakdown of an agent's real-data backtest (src/lib/market/backtest.ts).
 * One layout per strategy shape — grid_trading, health_factor, yield_history —
 * since each backtest reports different real metrics. Every number here comes
 * straight from agents.metadata.track_record; nothing is invented for display.
 */

function StatBox({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'negative';
}) {
  const toneClass =
    tone === 'positive' ? 'text-emerald-400' : tone === 'negative' ? 'text-red-400' : 'text-white';
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 flex flex-col items-center justify-center text-center">
      <p className={`text-lg font-bold leading-tight ${toneClass}`}>{value}</p>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}

function Donut({ pct, size = 64, stroke = 7 }: { pct: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = circumference * (1 - clamped / 100);
  const color = clamped >= 50 ? '#34d399' : clamped >= 25 ? '#fbbf24' : '#f87171';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#27272a" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-white">{Math.round(clamped)}%</span>
      </div>
    </div>
  );
}

function CompareBar({ label, pct, maxAbs, benchmark = false }: { label: string; pct: number; maxAbs: number; benchmark?: boolean }) {
  // Scaled relative to the larger of the two bars being compared (passed in as
  // maxAbs), not an arbitrary fixed multiplier — otherwise a tiny return and a
  // huge one would both hit the same cap and look identical.
  const width = Math.max(6, Math.min(100, (Math.abs(pct) / maxAbs) * 100));
  const positive = pct >= 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className={positive ? 'text-emerald-400' : 'text-red-400'}>
          {positive ? '+' : ''}
          {pct}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${positive ? (benchmark ? 'bg-emerald-500/50' : 'bg-emerald-500') : benchmark ? 'bg-red-500/50' : 'bg-red-500'}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function SurvivalBar({
  label,
  survivedDays,
  totalDays,
  liquidated,
}: {
  label: string;
  survivedDays: number;
  totalDays: number;
  liquidated: boolean;
}) {
  const pct = Math.max(4, Math.min(100, (survivedDays / totalDays) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className={liquidated ? 'text-red-400' : 'text-emerald-400'}>
          {liquidated ? `Liquidated day ${survivedDays}` : `Survived all ${totalDays}d`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${liquidated ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RangeBar({ worst, mean, best }: { worst: number; mean: number; best: number }) {
  const span = best - worst || 1;
  const markerPct = Math.max(2, Math.min(98, ((mean - worst) / span) * 100));
  return (
    <div>
      <div className="flex justify-between text-[11px] text-gray-500 mb-1">
        <span>{worst}% worst day</span>
        <span>{best}% best day</span>
      </div>
      <div className="relative h-2 rounded-full bg-gradient-to-r from-red-500/40 via-gray-700 to-emerald-500/40">
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-3.5 bg-white rounded-full shadow"
          style={{ left: `${markerPct}%` }}
          title={`Mean: ${mean}%`}
        />
      </div>
    </div>
  );
}

function parseWindowDays(window: unknown): number {
  const match = String(window ?? '').match(/(\d+)\s*days?/);
  return match ? Number(match[1]) : 0;
}

export function TrackRecordCard({ trackRecord }: { trackRecord: Record<string, unknown> }) {
  const strategy = trackRecord.strategy as string;

  if (strategy === 'grid_trading') {
    const closedTrades = Number(trackRecord.closed_trades ?? 0);
    const winRate = trackRecord.win_rate_pct !== null && trackRecord.win_rate_pct !== undefined ? Number(trackRecord.win_rate_pct) : null;
    const drawdown = Number(trackRecord.max_drawdown_pct ?? 0);
    const realizedReturn = Number(trackRecord.realized_return_pct ?? 0);
    const buyHoldReturn = Number(trackRecord.buy_hold_return_pct ?? 0);
    const maxAbsReturn = Math.max(Math.abs(realizedReturn), Math.abs(buyHoldReturn), 0.1);

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <StatBox label="Closed trades" value={String(closedTrades)} />
          <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-2 flex flex-col items-center justify-center">
            <Donut pct={winRate ?? 0} />
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Win rate</p>
          </div>
          <StatBox label="Max drawdown" value={`${drawdown}%`} tone="negative" />
        </div>
        <div className="space-y-2">
          <CompareBar label="This strategy" pct={realizedReturn} maxAbs={maxAbsReturn} />
          <CompareBar label="Buy & hold" pct={buyHoldReturn} maxAbs={maxAbsReturn} benchmark />
        </div>
      </div>
    );
  }

  if (strategy === 'health_factor') {
    const targetHf = Number(trackRecord.target_health_factor ?? 0);
    const naiveHf = Number(trackRecord.naive_comparison_hf ?? 0);
    const totalDays = parseWindowDays(trackRecord.window) || 365;
    const liquidated = !!trackRecord.would_have_liquidated;
    const naiveLiquidated = !!trackRecord.naive_would_have_liquidated;
    const survivedDays = liquidated ? Number(trackRecord.days_until_liquidation ?? 0) : totalDays;
    const naiveSurvivedDays = naiveLiquidated ? Number(trackRecord.naive_days_until_liquidation ?? 0) : totalDays;

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <StatBox label="This agent's target HF" value={targetHf.toFixed(2)} tone="positive" />
          <StatBox label="Naive comparison HF" value={naiveHf.toFixed(2)} />
        </div>
        <div className="space-y-2">
          <SurvivalBar label="This agent" survivedDays={survivedDays} totalDays={totalDays} liquidated={liquidated} />
          <SurvivalBar label="Naive (no margin)" survivedDays={naiveSurvivedDays} totalDays={totalDays} liquidated={naiveLiquidated} />
        </div>
      </div>
    );
  }

  if (strategy === 'yield_history') {
    const mean = Number(trackRecord.mean_apy_pct ?? 0);
    const volatility = Number(trackRecord.apy_volatility ?? 0);
    const best = Number(trackRecord.best_day_apy_pct ?? 0);
    const worst = Number(trackRecord.worst_day_apy_pct ?? 0);

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <StatBox label="Mean APY" value={`${mean}%`} tone="positive" />
          <StatBox label="Volatility (±)" value={`${volatility}`} />
        </div>
        <RangeBar worst={worst} mean={mean} best={best} />
      </div>
    );
  }

  return null;
}
