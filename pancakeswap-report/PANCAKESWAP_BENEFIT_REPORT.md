# PancakeSwap Benefit Report — Agent Bazaar

Submitted for the PancakeSwap Partner Challenge, BNB Chain "Build the Era"
hackathon (Aug 5 – Sep 9, 2026).

## Summary

The challenge asks for a real benefit to PancakeSwap traders or liquidity
providers — smarter liquidity management, finding better yields, or safe
automated swaps without ever holding user funds. Agent Bazaar's agents
already deliver the first two live in production; this report adds a third,
using PancakeSwap's own official SDK directly (not through a third-party
aggregator), and documents all three with real numbers.

| Benefit | Agent | Real data source | What it does |
|---|---|---|---|
| Smarter liquidity management | AutoRebalance, RangeKeeper | DefiLlama (covers PancakeSwap pools directly) | Suggests LP range width from real pool volatility |
| Finding better yields | PancakeOptimizer, BeefyHarvester v2 | DefiLlama | Ranks real PancakeSwap yield against alternatives, live |
| Safe automated swap routing | **PancakeRouter** *(new)* | `@pancakeswap/smart-router`, live on-chain | Real best-trade route/price across real PancakeSwap V3 pools — a quote, never an executed transaction |

All three rows are real, hireable agents live in the marketplace right now
— [agent-bazaar-wheat.vercel.app/agent/1019beed-ff7f-474c-acfd-d160b20713d6](https://agent-bazaar-wheat.vercel.app/agent/1019beed-ff7f-474c-acfd-d160b20713d6)
is PancakeRouter's real page (free, registered onchain as ERC-8004 agent
#1922, tx `0x2d00bc48fc4fb294b82e64f164e460402b782566b0d1db5f4d5af441555e4b3c`).

None of this touches user funds. Every number below is real, live, and
reproducible — nothing here is a mocked API response or an invented example.

---

## 1. Smarter liquidity management — real LP range recommendations

**AutoRebalance** and **RangeKeeper** (the `rebalancing` category) each
combine their own strategy config with a live volatility read of a real
PancakeSwap pool (via DefiLlama, which indexes PancakeSwap pools directly)
to suggest how wide an LP range should be — a wider range needs less
rebalancing (and gas) but earns a thinner fee density; narrower earns more
but needs tending. Real, current output from both agents, fetched live:

```json
// AutoRebalance — PancakeSwap WBNB-BUSD pool, wider/portfolio-style range
{
  "pool": "pancakeswap-amm WBNB-BUSD",
  "pool_sigma": 0.24447,
  "tvl_usd": 1231065,
  "apy_base": 2.61018,
  "il_risk": "yes",
  "suggested_range_pct": 36.67
}

// RangeKeeper — PancakeSwap CAKE-WBNB pool, narrower/concentrated-liquidity range
{
  "pool": "pancakeswap-amm CAKE-WBNB",
  "pool_sigma": 0.33146,
  "tvl_usd": 8803104,
  "apy_base": 1.14531,
  "il_risk": "yes",
  "suggested_range_pct": 24.86
}
```

Two agents, two different real PancakeSwap pools, two genuinely different
recommendations from live data — not a shared lookup table. Both also carry
a real 90-day backtest of the tracked pool's realized APY (mean, volatility,
best/worst day), visible on each agent's page and reproducible via
`src/lib/market/backtest.ts`.

## 2. Finding better yields — real PancakeSwap-vs-alternative comparison

**PancakeOptimizer** ranks real, live yield across PancakeSwap LPs and Venus
lending, and flags the current winner:

```json
{
  "candidates": [
    { "source": "PancakeSwap WBNB-BUSD LP", "apy": 2.61018, "tvl_usd": 1231065 },
    { "source": "Venus USDT lending",       "apy": 2.45981, "tvl_usd": 71824395 },
    { "source": "PancakeSwap CAKE-WBNB LP",  "apy": 1.14531, "tvl_usd": 8803104 }
  ],
  "winner": "PancakeSwap WBNB-BUSD LP"
}
```

Right now, PancakeSwap's own WBNB-BUSD pool is the real winner — a PancakeSwap
LP genuinely outperforming the lending alternative this agent also checks,
found automatically instead of manually tab-switching between protocols.

## 3. Safe automated swap routing — new, using PancakeSwap's own SDK

Everything above reads PancakeSwap pool data through DefiLlama. This section
uses **PancakeSwap's own official routing SDK directly**
(`@pancakeswap/smart-router`, specifically its `InfinityRouter` API) to
compute a real best-trade route — the same routing logic PancakeSwap's own
frontend uses — purely from a public BSC mainnet RPC. No subgraph, no API
key: `InfinityRouter.getV3CandidatePools` fetches real candidate pools via
on-chain multicall, and `getBestTrade` finds the real best route/price
across them, splitting across multiple pools when that's cheaper.

This is a quote, not an executed trade — no wallet ever signs anything here,
so it can never put a user's funds at risk, directly matching the
challenge's own framing of "safe automated swaps."

This capability is **PancakeRouter**, a real, free, hireable agent
(`src/lib/market/pancakeswap.ts`, `metadata.strategy: 'pancake_route'`) —
not only a standalone script. Hiring it (or just viewing its page) runs this
exact lookup live and shows the real result:

```json
{
  "task": "Best real PancakeSwap route: BNB → CAKE",
  "data_sources": ["https://bsc-dataseed1.bnbchain.org"],
  "inputs": { "from_symbol": "BNB", "to_symbol": "CAKE", "amount_in": 1, "real_candidate_pools_fetched": 81 },
  "result": { "amount_out": 403.183139, "implied_price": 403.183139, "route_legs": 2, "gas_use_estimate": "164000" },
  "elapsed_ms": 495
}
```

The original standalone script (`pancakeswap-report/best-route.mjs`,
verified separately below) proved the mechanism before it was wired into a
real agent — both use the identical `InfinityRouter` call.

Real output from that script, run against BSC mainnet:

```json
{
  "label": "Swap 1 BNB → CAKE",
  "real_candidate_pools_fetched": 81,
  "input": { "amount": 1, "symbol": "BNB" },
  "output": { "amount": 404.332199, "symbol": "CAKE" },
  "implied_price": "404.332199 CAKE per BNB",
  "route_legs": 2,
  "gas_use_estimate": "164000",
  "elapsed_ms": 4280
}
```

```json
{
  "label": "Swap 100 USDT → CAKE",
  "real_candidate_pools_fetched": 65,
  "input": { "amount": 100, "symbol": "USDT" },
  "output": { "amount": 58.030063, "symbol": "CAKE" },
  "implied_price": "0.580301 CAKE per USDT",
  "route_legs": 1,
  "gas_use_estimate": "164000",
  "elapsed_ms": 1745
}
```

Both quotes independently imply the same real CAKE price (≈$1.72–1.73,
cross-checked against BNB's own real ~$700 price from elsewhere in this
project) — a sanity check that this is genuine on-chain data, not a
fabricated number. Full output: `best-route-output.json`. Reproduce with
`node pancakeswap-report/best-route.mjs`.

---

## Honest scope

- This is decision-support, not custody or execution. No agent in this
  marketplace holds a swap-capable session on a user's behalf yet — see the
  Altana section of the main README for the one place we explored real
  delegated execution, and why it's not wired into a live user flow today.
- All three benefits above (Sections 1, 2, 3) are live, hireable agents in
  production today — PancakeRouter included, not only a standalone script.
- `@pancakeswap/smart-router`'s latest release (`7.7.0`) currently ships a
  broken dependency pin (`@pancakeswap/infinity-stable-sdk@1.0.2`, a version
  that was never published) — this project pins `7.6.1`, the last version
  before that break, verified working end-to-end, including against the
  actual deployed Vercel production environment (not just local dev) — a
  real real-world silent-in-production failure with a different upstream
  API earlier in this project made that specific check worth calling out.
