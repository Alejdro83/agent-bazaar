/**
 * Real, on-chain best-trade-route lookup against PancakeSwap, using
 * PancakeSwap's own official SDK (@pancakeswap/smart-router's
 * InfinityRouter) — no subgraph, no API key, just a public BSC mainnet RPC.
 * This is decision-support only (a quote/route, never an executed
 * transaction) — same "recommendation, not custody" posture as every other
 * agent in this marketplace (see src/lib/market/signals.ts).
 *
 * Real candidate pools are fetched live via multicall against PancakeSwap's
 * real V3 pool contracts, then InfinityRouter finds the real best route
 * (splitting across pools/hops as needed) for a real trade size.
 *
 * Usage: node pancakeswap-report/best-route.mjs
 */

import { createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { Native, CurrencyAmount, TradeType } from '@pancakeswap/sdk';
import { InfinityRouter } from '@pancakeswap/smart-router';
import { bscTokens } from '@pancakeswap/tokens';
import { writeFileSync } from 'fs';

const client = createPublicClient({
  chain: bsc,
  transport: http('https://bsc-dataseed1.bnbchain.org'),
  batch: { multicall: { batchSize: 1024 * 200 } },
});

async function bestTrade({ label, fromCurrency, toCurrency, rawAmount }) {
  const start = performance.now();

  const candidatePools = await InfinityRouter.getV3CandidatePools({
    clientProvider: () => client,
    currencyA: fromCurrency,
    currencyB: toCurrency,
  });

  const amount = CurrencyAmount.fromRawAmount(fromCurrency, rawAmount);
  const trade = await InfinityRouter.getBestTrade(amount, toCurrency, TradeType.EXACT_INPUT, {
    gasPriceWei: () => client.getGasPrice(),
    candidatePools,
  });

  const elapsed_ms = Math.round(performance.now() - start);

  if (!trade) {
    return { label, error: 'No real trade route found', candidate_pools: candidatePools.length, elapsed_ms };
  }

  const input = Number(trade.inputAmount.toExact());
  const output = Number(trade.outputAmount.toExact());

  return {
    label,
    data_source: 'PancakeSwap V3 pools, live on-chain via @pancakeswap/smart-router (InfinityRouter) — no subgraph, no API key',
    real_candidate_pools_fetched: candidatePools.length,
    input: { amount: input, symbol: trade.inputAmount.currency.symbol },
    output: { amount: output, symbol: trade.outputAmount.currency.symbol },
    implied_price: `${(output / input).toFixed(6)} ${trade.outputAmount.currency.symbol} per ${trade.inputAmount.currency.symbol}`,
    route_legs: trade.routes.length,
    gas_use_estimate: trade.gasUseEstimate?.toString() ?? null,
    elapsed_ms,
    timestamp: new Date().toISOString(),
  };
}

const bnb = Native.onChain(56);

const results = [];

results.push(
  await bestTrade({
    label: 'Swap 1 BNB → CAKE',
    fromCurrency: bnb,
    toCurrency: bscTokens.cake,
    rawAmount: 10n ** 18n,
  })
);

results.push(
  await bestTrade({
    label: 'Swap 100 USDT → CAKE',
    fromCurrency: bscTokens.usdt,
    toCurrency: bscTokens.cake,
    rawAmount: 100n * 10n ** 18n, // BSC USDT (BEP-20) uses 18 decimals, not 6
  })
);

console.log(JSON.stringify(results, null, 2));
writeFileSync(new URL('./best-route-output.json', import.meta.url), JSON.stringify(results, null, 2));
