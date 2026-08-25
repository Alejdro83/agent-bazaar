/**
 * Real-data backtests — the TermiX rubric asks for "win rate, the window,
 * and the risk taken" (20% of that track's score). None of this is live
 * capital; every function is explicitly a backtest over real historical
 * data (Binance klines, DefiLlama pool history), reproducible by re-running
 * this module. Results are stored in agents.metadata.track_record by
 * scripts/run-backtests.ts and rendered with an explicit "backtest, not
 * live capital" label — see src/app/agent/[id]/page.tsx.
 */

const BINANCE_KLINES = 'https://data-api.binance.vision/api/v3/klines';

interface Candle {
  high: number;
  low: number;
  close: number;
}

async function fetchKlines(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  const res = await fetch(`${BINANCE_KLINES}?symbol=${symbol}&interval=${interval}&limit=${limit}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Binance API error: ${res.status} ${res.statusText}`);
  const raw: unknown[][] = await res.json();
  return raw.map((c) => ({ high: Number(c[2]), low: Number(c[3]), close: Number(c[4]) }));
}

function atr(candles: Candle[]): number {
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

/**
 * grid_trading backtest: simulates a static grid (sized once from the first
 * 4 days of real volatility, using the agent's own spacing/range config —
 * same heuristic as the live signal) over 90 real days of BNB/USDT, using
 * close-to-close level crossings. A completed round trip nets one grid
 * spacing minus an assumed 0.2% round-trip trading fee (a real DEX/CEX
 * ballpark, not agent-specific — no fee data source exists to look this up
 * per venue).
 */
export async function backtestGrid(config: {
  symbol?: string;
  spacingAtrMultiple: number;
  rangePct: number;
}) {
  const symbol = config.symbol ?? 'BNBUSDT';
  const candles = await fetchKlines(symbol, '4h', 540); // ~90 days
  const seedWindow = candles.slice(0, 24); // first ~4 days sets the static grid
  const gridSpacing = atr(seedWindow) * config.spacingAtrMultiple;
  const seedPrice = seedWindow[seedWindow.length - 1].close;
  const rangeWidth = seedPrice * config.rangePct * 2;
  const rangeLow = seedPrice - rangeWidth / 2;
  const rangeHigh = seedPrice + rangeWidth / 2;
  const feeRate = 0.002; // 0.2% round trip, a real-world ballpark, not fetched

  const levels: number[] = [];
  for (let lvl = rangeLow; lvl <= rangeHigh; lvl += gridSpacing) levels.push(lvl);

  const openBuys = new Map<number, number>(); // level -> unit count (0 or 1)
  const closedTrades: number[] = []; // realized profit per round trip (in price units)
  const equityCurve: number[] = [];
  let realizedPnl = 0;

  let prevClose = candles[24].close;
  for (let i = 25; i < candles.length; i++) {
    const close = candles[i].close;
    for (const level of levels) {
      if (prevClose > level && close <= level && !openBuys.has(level)) {
        openBuys.set(level, 1); // crossed down through a level → buy
      }
      const levelBelow = level - gridSpacing;
      if (prevClose < level && close >= level && openBuys.has(levelBelow)) {
        openBuys.delete(levelBelow); // crossed up through a level → sell the position bought one level down
        const profit = gridSpacing - level * feeRate;
        realizedPnl += profit;
        closedTrades.push(profit);
      }
    }
    const unrealized = [...openBuys.keys()].reduce((sum, lvl) => sum + (close - lvl), 0);
    equityCurve.push(realizedPnl + unrealized);
    prevClose = close;
  }

  // Capital base: quote-currency needed to hold 1 unit of base asset at
  // every grid level at once — a real cost proxy (not gridSpacing, which is
  // a price *distance*, not a capital amount; using it as the denominator
  // understated the base and made drawdown % blow past 1000).
  const capitalBase = levels.length * seedPrice;
  let peakValue = capitalBase;
  let maxDrawdownPct = 0;
  for (const equity of equityCurve) {
    const value = capitalBase + equity;
    peakValue = Math.max(peakValue, value);
    const drawdown = ((peakValue - value) / peakValue) * 100;
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdown);
  }

  const finalClose = candles[candles.length - 1].close;
  const winningTrades = closedTrades.filter((p) => p > 0).length;

  return {
    strategy: 'grid_trading',
    window: '90 days (4h candles)',
    data_source: `${BINANCE_KLINES}?symbol=${symbol}&interval=4h`,
    is_backtest: true,
    grid_spacing: Math.round(gridSpacing * 100) / 100,
    grid_levels: levels.length,
    closed_trades: closedTrades.length,
    win_rate_pct: closedTrades.length > 0 ? Math.round((winningTrades / closedTrades.length) * 1000) / 10 : null,
    realized_return_pct: Math.round((realizedPnl / capitalBase) * 1000) / 10,
    max_drawdown_pct: Math.round(maxDrawdownPct * 10) / 10,
    buy_hold_return_pct: Math.round(((finalClose - seedPrice) / seedPrice) * 1000) / 10,
    fee_assumption_pct_roundtrip: feeRate * 100,
  };
}

/**
 * yield_optimisation / rebalancing backtest: realized APY mean/volatility
 * over the real last-90-days history of the pool the agent actually tracks
 * (DefiLlama's per-pool /chart endpoint — same source as the live signal).
 */
export async function backtestPoolHistory(config: { poolId: string; label: string }) {
  const res = await fetch(`https://yields.llama.fi/chart/${config.poolId}`, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`DefiLlama chart API error: ${res.status}`);
  const body = await res.json();
  const points: { apy: number | null }[] = body.data;
  const window = points.slice(-90).map((p) => p.apy).filter((a): a is number => a !== null && !Number.isNaN(a));

  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length;

  return {
    strategy: 'yield_history',
    window: `90 days (real daily snapshots, ${window.length} observed)`,
    data_source: `https://yields.llama.fi/chart/${config.poolId}`,
    is_backtest: true,
    pool: config.label,
    mean_apy_pct: Math.round(mean * 100) / 100,
    apy_volatility: Math.round(Math.sqrt(variance) * 100) / 100,
    best_day_apy_pct: Math.round(Math.max(...window) * 100) / 100,
    worst_day_apy_pct: Math.round(Math.min(...window) * 100) / 100,
  };
}

/**
 * health_factor backtest: real BNB/USDT daily prices over the last year,
 * checking how many days a position opened at the agent's target health
 * factor would have survived vs. a naive user who leaves almost no safety
 * margin (HF 1.05) — the same risk this category's live signal warns about.
 */
export async function backtestHealthFactor(config: { targetHealthFactor: number; symbol?: string }) {
  const symbol = config.symbol ?? 'BNBUSDT';
  const candles = await fetchKlines(symbol, '1d', 365);
  const closes = candles.map((c) => c.close);
  const openPrice = closes[0];
  const naiveHf = 1.05;

  function daysUntilLiquidation(startHf: number): number | null {
    for (let i = 0; i < closes.length; i++) {
      const hf = startHf * (closes[i] / openPrice);
      if (hf <= 1.0) return i;
    }
    return null; // never liquidated over the observed window
  }

  const agentDays = daysUntilLiquidation(config.targetHealthFactor);
  const naiveDays = daysUntilLiquidation(naiveHf);

  return {
    strategy: 'health_factor',
    window: `${closes.length} days (real daily closes)`,
    data_source: `${BINANCE_KLINES}?symbol=${symbol}&interval=1d`,
    is_backtest: true,
    target_health_factor: config.targetHealthFactor,
    would_have_liquidated: agentDays !== null,
    days_until_liquidation: agentDays,
    naive_comparison_hf: naiveHf,
    naive_would_have_liquidated: naiveDays !== null,
    naive_days_until_liquidation: naiveDays,
  };
}
