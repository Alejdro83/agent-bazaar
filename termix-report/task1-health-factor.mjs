// Task 1 (required: trading/stock/security) — "Given $1000 of BNB as
// collateral, what's the maximum safe borrow on Venus right now, targeting
// a health factor of 1.5?" Live data from Venus Protocol's public API
// (api.venus.io), same source the Venus app itself reads.
const COLLATERAL_USD = 1000;
const TARGET_HEALTH_FACTOR = 1.5;

const t0 = performance.now();

const res = await fetch('https://api.venus.io/markets?chainId=56&limit=100');
const data = await res.json();

const bnb = data.result.find((m) => m.symbol === 'vBNB');
const usdt = data.result.find((m) => m.symbol === 'vUSDT' && m.borrowerCount > 1000);

const bnbPrice = Number(bnb.underlyingPriceMantissa) / 1e18;
const collateralFactor = Number(bnb.collateralFactorMantissa) / 1e18;
const usdtPrice = Number(usdt.underlyingPriceMantissa) / 1e18;

const bnbAmount = COLLATERAL_USD / bnbPrice;
const maxBorrowUsd = (COLLATERAL_USD * collateralFactor) / TARGET_HEALTH_FACTOR;
const maxBorrowUsdt = maxBorrowUsd / usdtPrice;

const t1 = performance.now();

const output = {
  task: 'Max safe borrow given $1000 BNB collateral (target health factor 1.5)',
  data_source: 'https://api.venus.io/markets?chainId=56 (live, fetched at run time)',
  inputs: {
    collateral_usd: COLLATERAL_USD,
    target_health_factor: TARGET_HEALTH_FACTOR,
    bnb_price_usd: bnbPrice,
    bnb_collateral_factor: collateralFactor,
    usdt_price_usd: usdtPrice,
  },
  result: {
    bnb_collateral_amount: bnbAmount,
    max_safe_borrow_usd: maxBorrowUsd,
    max_safe_borrow_usdt: maxBorrowUsdt,
  },
  elapsed_ms: Math.round(t1 - t0),
  timestamp: new Date().toISOString(),
};

console.log(JSON.stringify(output, null, 2));
