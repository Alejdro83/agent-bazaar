/**
 * Real, on-chain best-trade-route lookup against PancakeSwap, using
 * PancakeSwap's own official routing SDK (@pancakeswap/smart-router's
 * InfinityRouter) — no subgraph, no API key, just a public BSC mainnet RPC.
 * Same math already proven out and verified in
 * pancakeswap-report/best-route.mjs; ported here to back a real, hireable
 * agent's live signal instead of only a standalone script.
 *
 * Decision-support only — a quote, never an executed transaction — so it
 * can never put a user's funds at risk, same posture as every other signal
 * in this file's siblings (venus.ts, binance.ts, defillama.ts).
 */

import { createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { Native, CurrencyAmount, TradeType, type Currency } from '@pancakeswap/sdk';
import { InfinityRouter } from '@pancakeswap/smart-router';
import { bscTokens } from '@pancakeswap/tokens';
import { cached } from './cache';

const client = createPublicClient({
  chain: bsc,
  transport: http('https://bsc-dataseed1.bnbchain.org'),
  batch: { multicall: { batchSize: 1024 * 200 } },
});

function resolveToken(symbol: string): Currency {
  if (symbol.toUpperCase() === 'BNB') return Native.onChain(56);
  const token = (bscTokens as Record<string, Currency>)[symbol.toLowerCase()];
  if (!token) throw new Error(`Unknown PancakeSwap token symbol: ${symbol}`);
  return token;
}

/** grid_trading (swap-routing) category: real best PancakeSwap trade route/price for a configured swap. */
export async function computePancakeRouteSignal(config: {
  fromSymbol: string;
  toSymbol: string;
  amountRaw: string; // in the from-token's smallest unit, as a string (bigint-safe)
}) {
  const fromCurrency = resolveToken(config.fromSymbol);
  const toCurrency = resolveToken(config.toSymbol);

  // Candidate pools are cached briefly — they don't change meaningfully
  // request-to-request, and re-fetching via multicall on every hire/signal
  // view would be needlessly slow and RPC-heavy.
  // @pancakeswap/smart-router bundles its own transitive viem type copy,
  // which TypeScript treats as structurally distinct from this repo's
  // top-level viem even though both are viem 2.x and functionally identical
  // at runtime (verified: pancakeswap-report/best-route.mjs runs this exact
  // client against this exact SDK successfully). Cast at this one boundary
  // rather than fighting a duplicate-package type mismatch across the app.
  const candidatePools = await cached(
    `pancake:pools:${config.fromSymbol}:${config.toSymbol}`,
    120,
    () =>
      InfinityRouter.getV3CandidatePools({
        clientProvider: (() => client) as never,
        currencyA: fromCurrency,
        currencyB: toCurrency,
      })
  );

  const amount = CurrencyAmount.fromRawAmount(fromCurrency, BigInt(config.amountRaw));
  const trade = await InfinityRouter.getBestTrade(amount, toCurrency, TradeType.EXACT_INPUT, {
    gasPriceWei: () => client.getGasPrice(),
    candidatePools,
  });

  if (!trade) {
    throw new Error(`No real PancakeSwap route found for ${config.fromSymbol} -> ${config.toSymbol}`);
  }

  const input = Number(trade.inputAmount.toExact());
  const output = Number(trade.outputAmount.toExact());

  return {
    // A real URL, not prose — the detail page does `new URL(data_sources[0])`
    // to render a clickable source link, which throws on a non-URL string.
    data_sources: ['https://bsc-dataseed1.bnbchain.org'],
    inputs: {
      from_symbol: trade.inputAmount.currency.symbol,
      to_symbol: trade.outputAmount.currency.symbol,
      amount_in: input,
      real_candidate_pools_fetched: candidatePools.length,
    },
    result: {
      amount_out: Math.round(output * 1e6) / 1e6,
      implied_price: Math.round((output / input) * 1e6) / 1e6,
      route_legs: trade.routes.length,
      gas_use_estimate: trade.gasUseEstimate?.toString() ?? null,
    },
  };
}
