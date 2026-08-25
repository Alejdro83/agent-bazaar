/**
 * Venus Protocol public API client (no key required) — same endpoint and
 * math proven out in termix-report/task1-health-factor.mjs, ported here so
 * it can back a live `health_factor` agent signal instead of a one-off script.
 */

import { cached } from './cache';

const VENUS_MARKETS_URL = 'https://api.venus.io/markets?chainId=56&limit=100';

export interface VenusMarket {
  symbol: string;
  underlyingPriceMantissa: string;
  collateralFactorMantissa: string;
  supplyApyDecimal: string;
  borrowApyDecimal: string;
  borrowerCount: number;
}

async function fetchVenusMarkets(): Promise<VenusMarket[]> {
  return cached('venus:markets', 300, async () => {
    const res = await fetch(VENUS_MARKETS_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Venus API error: ${res.status} ${res.statusText}`);
    const body = await res.json();
    return body.result as VenusMarket[];
  });
}

function findMarket(markets: VenusMarket[], symbol: string): VenusMarket {
  const market = markets.find((m) => m.symbol === symbol);
  if (!market) throw new Error(`Venus market ${symbol} not found`);
  return market;
}

/** health_factor category: max safe borrow given collateral, targeting a health factor (not the liquidation edge). */
export async function computeHealthFactorSignal(config: {
  collateralSymbol?: string; // Venus vToken symbol, default vBNB
  borrowSymbol?: string; // default vUSDT
  collateralUsd?: number; // default 1000
  targetHealthFactor: number;
}) {
  const collateralSymbol = config.collateralSymbol ?? 'vBNB';
  const borrowSymbol = config.borrowSymbol ?? 'vUSDT';
  const collateralUsd = config.collateralUsd ?? 1000;

  const markets = await fetchVenusMarkets();
  const collateralMarket = findMarket(markets, collateralSymbol);
  const borrowMarket = findMarket(markets, borrowSymbol);

  const collateralPrice = Number(collateralMarket.underlyingPriceMantissa) / 1e18;
  const collateralFactor = Number(collateralMarket.collateralFactorMantissa) / 1e18;
  const borrowPrice = Number(borrowMarket.underlyingPriceMantissa) / 1e18;

  const maxSafeBorrowUsd = (collateralUsd * collateralFactor) / config.targetHealthFactor;
  const maxSafeBorrowUnits = maxSafeBorrowUsd / borrowPrice;
  const maxLiquidationEdgeUsd = collateralUsd * collateralFactor;

  return {
    data_sources: ['https://api.venus.io/markets?chainId=56'],
    inputs: {
      collateral_symbol: collateralSymbol,
      borrow_symbol: borrowSymbol,
      collateral_usd: collateralUsd,
      collateral_price_usd: collateralPrice,
      collateral_factor: collateralFactor,
      target_health_factor: config.targetHealthFactor,
    },
    result: {
      max_safe_borrow_usd: Math.round(maxSafeBorrowUsd * 100) / 100,
      max_safe_borrow_units: Math.round(maxSafeBorrowUnits * 100) / 100,
      max_liquidation_edge_usd: Math.round(maxLiquidationEdgeUsd * 100) / 100,
      safety_margin_usd: Math.round((maxLiquidationEdgeUsd - maxSafeBorrowUsd) * 100) / 100,
    },
  };
}

/** yield_optimisation category: Venus lending APY for a given supply market. */
export async function fetchVenusSupplyApy(symbol: string): Promise<{ apy: number; borrowerCount: number }> {
  const markets = await fetchVenusMarkets();
  const market = findMarket(markets, symbol);
  return { apy: Number(market.supplyApyDecimal), borrowerCount: market.borrowerCount };
}
