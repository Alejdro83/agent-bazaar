// Task 3 (grid trading) — "Given the last 24h of real WBNB/USDT price
// action, what grid spacing and level count make sense right now?"
// ATR (Average True Range) is a standard technical-analysis volatility
// measure; grid spacing = a fraction of ATR is a standard, well-documented
// grid-bot sizing heuristic (not proprietary), so a wide grid isn't sized
// off a calm hour and a tight one isn't blown out by a single spike.
const SYMBOL = 'BNBUSDT'; // BNB/USDT — the real, liquid proxy for WBNB/USDT on BSC
const SPACING_ATR_MULTIPLE = 0.5;
const RANGE_PCT = 0.05; // ±5% band around current price

const t0 = performance.now();

const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${SYMBOL}&interval=1h&limit=25`);
const candles = await res.json();
// candle: [openTime, open, high, low, close, volume, ...]
const parsed = candles.map((c) => ({
  high: Number(c[2]), low: Number(c[3]), close: Number(c[4]),
}));

// True Range needs the previous close, so start from the 2nd candle —
// leaves exactly 24 TR values from 25 candles.
const trueRanges = [];
for (let i = 1; i < parsed.length; i++) {
  const { high, low } = parsed[i];
  const prevClose = parsed[i - 1].close;
  trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
}
const atr = trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
const currentPrice = parsed[parsed.length - 1].close;

const gridSpacing = atr * SPACING_ATR_MULTIPLE;
const rangeWidth = currentPrice * RANGE_PCT * 2;
const gridLevels = Math.max(2, Math.round(rangeWidth / gridSpacing));

const t1 = performance.now();

const output = {
  task: 'Grid spacing + level count for BNB/USDT given real last-24h volatility',
  data_source: 'https://api.binance.com/api/v3/klines (live, 1h candles)',
  inputs: {
    current_price_usdt: currentPrice,
    atr_24h_usdt: atr,
    spacing_atr_multiple: SPACING_ATR_MULTIPLE,
    range_pct: RANGE_PCT,
  },
  result: {
    grid_spacing_usdt: gridSpacing,
    grid_spacing_pct: (gridSpacing / currentPrice) * 100,
    range_low_usdt: currentPrice * (1 - RANGE_PCT),
    range_high_usdt: currentPrice * (1 + RANGE_PCT),
    grid_levels: gridLevels,
  },
  elapsed_ms: Math.round(t1 - t0),
  timestamp: new Date().toISOString(),
};

console.log(JSON.stringify(output, null, 2));
