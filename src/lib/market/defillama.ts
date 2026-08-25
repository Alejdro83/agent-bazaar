/**
 * DefiLlama Yields API client (https://yields.llama.fi, no key required).
 * Covers Venus, Beefy and PancakeSwap pools on BSC from one endpoint —
 * backs both `yield_optimisation` (best real APY across protocols) and
 * `rebalancing` (LP pool volatility → suggested range width), the one
 * category the earlier TermiX report had no live data source for.
 */

import { cached } from './cache';

export interface BscPool {
  pool: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase: number | null;
  sigma: number | null; // DefiLlama's own APY-volatility index for the pool
  ilRisk: string | null;
}

interface RawPool {
  chain: string;
  pool: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase: number | null;
  sigma: number | null;
  ilRisk: string | null;
}

/** Fetches the full pool list once per cache window, keeping only BSC pools (~500 of ~35k). */
async function fetchAllBscPools(): Promise<BscPool[]> {
  return cached('defillama:bsc-pools', 600, async () => {
    const res = await fetch('https://yields.llama.fi/pools', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`DefiLlama API error: ${res.status} ${res.statusText}`);
    const body = await res.json();
    return (body.data as RawPool[])
      .filter((p) => p.chain === 'BSC')
      .map((p) => ({
        pool: p.pool,
        project: p.project,
        symbol: p.symbol,
        tvlUsd: p.tvlUsd,
        apy: p.apy,
        apyBase: p.apyBase,
        sigma: p.sigma,
        ilRisk: p.ilRisk,
      }));
  });
}

function findPool(pools: BscPool[], poolId: string): BscPool {
  const pool = pools.find((p) => p.pool === poolId);
  if (!pool) throw new Error(`DefiLlama pool ${poolId} not found on BSC`);
  return pool;
}

/** yield_optimisation category: best real APY right now across a set of candidate pools (Venus/Beefy/PancakeSwap). */
export async function computeYieldCompareSignal(config: {
  candidates: { label: string; poolId: string }[];
}) {
  const pools = await fetchAllBscPools();
  const results = config.candidates.map(({ label, poolId }) => {
    const pool = findPool(pools, poolId);
    return { source: label, project: pool.project, symbol: pool.symbol, apy: pool.apy, tvl_usd: pool.tvlUsd };
  });
  results.sort((a, b) => b.apy - a.apy);

  return {
    data_sources: ['https://yields.llama.fi/pools'],
    inputs: { candidates: config.candidates },
    result: { candidates: results, winner: results[0].source },
  };
}

/**
 * rebalancing category: suggested LP range width from a pool's real
 * volatility index — a wider range costs less in rebalancing fees but earns
 * less fee density; narrower earns more but rebalances (and pays gas) more
 * often. Honest heuristic, explicitly labeled: DefiLlama's `sigma` measures
 * APY volatility (a live proxy for how choppy the pool's economics are), not
 * underlying-price volatility directly — there's no free BSC LP-range API to
 * derive that more precisely.
 */
export async function computeRebalancingSignal(config: { poolId: string; rangeSigmaMultiple: number }) {
  const pools = await fetchAllBscPools();
  const pool = findPool(pools, config.poolId);
  const sigma = pool.sigma ?? 0;
  const suggestedRangePct = Math.max(2, sigma * config.rangeSigmaMultiple * 100);

  return {
    data_sources: ['https://yields.llama.fi/pools'],
    inputs: {
      pool: `${pool.project} ${pool.symbol}`,
      pool_sigma: sigma,
      range_sigma_multiple: config.rangeSigmaMultiple,
    },
    result: {
      tvl_usd: Math.round(pool.tvlUsd),
      apy_base: pool.apyBase,
      il_risk: pool.ilRisk,
      suggested_range_pct: Math.round(suggestedRangePct * 100) / 100,
    },
  };
}
