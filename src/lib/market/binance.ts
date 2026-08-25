/**
 * Binance public market-data API client (no key required) — same endpoint
 * and ATR math proven out in termix-report/task3-grid-params.mjs, ported here
 * so it can back a live `grid_trading` agent signal.
 */

import { cached } from './cache';

export interface Kline {
  openTime: number;
  high: number;
  low: number;
  close: number;
}

async function fetchKlines(symbol: string, interval: string, limit: number): Promise<Kline[]> {
  return cached(`binance:klines:${symbol}:${interval}:${limit}`, 300, async () => {
    const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Binance API error: ${res.status} ${res.statusText}`);
    const raw: unknown[][] = await res.json();
    return raw.map((c) => ({
      openTime: c[0] as number,
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
    }));
  });
}

function averageTrueRange(candles: Kline[]): number {
  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
}

/** grid_trading category: ATR-based grid spacing + level count for a pair, from real last-24h volatility. */
export async function computeGridSignal(config: {
  symbol?: string; // default BNBUSDT
  spacingAtrMultiple: number;
  rangePct: number;
}) {
  const symbol = config.symbol ?? 'BNBUSDT';
  const candles = await fetchKlines(symbol, '1h', 25);
  const atr = averageTrueRange(candles);
  const currentPrice = candles[candles.length - 1].close;

  const gridSpacing = atr * config.spacingAtrMultiple;
  const rangeWidth = currentPrice * config.rangePct * 2;
  const gridLevels = Math.max(2, Math.round(rangeWidth / gridSpacing));

  return {
    data_sources: [`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=1h`],
    inputs: {
      symbol,
      current_price: currentPrice,
      atr_24h: Math.round(atr * 100) / 100,
      spacing_atr_multiple: config.spacingAtrMultiple,
      range_pct: config.rangePct,
    },
    result: {
      grid_spacing: Math.round(gridSpacing * 100) / 100,
      grid_spacing_pct: Math.round((gridSpacing / currentPrice) * 10000) / 100,
      range_low: Math.round((currentPrice - rangeWidth / 2) * 100) / 100,
      range_high: Math.round((currentPrice + rangeWidth / 2) * 100) / 100,
      grid_levels: gridLevels,
    },
  };
}
