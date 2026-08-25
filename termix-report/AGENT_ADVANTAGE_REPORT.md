# Agent Advantage Report — Agent Bazaar

Submitted for the TermiX track, BNB Chain "Build the Era" hackathon (Aug 5 – Sep 9, 2026).

## Summary

Three real DeFi tasks on BNB Smart Chain, each run two ways — the manual path a
user takes today, and the path of **actually hiring the corresponding agent
through Agent Bazaar** (`POST /api/contracts` against the live marketplace,
not a standalone script) — using real, live public data (Venus Protocol's
API, Beefy/DefiLlama's API, Binance's market API — no synthetic data, no
mocked numbers). Task 1 is the required trading/security task.

| # | Task | Category | Agent hired | Manual (est.) | Hired via marketplace (measured) | Real advantage |
|---|---|---|---|---|---|---|
| 1 | Max safe borrow given BNB collateral | **Security** | VenusGuard | 3–5 min, *and* commonly skips the safety margin entirely | 215 ms | Speed **and** a safety margin a manual user typically omits |
| 2 | Best real yield right now (Beefy vs Venus) | Yield | BeefyHarvester v2 | 2–4 min per protocol checked, values go stale mid-comparison | 858 ms | Speed, and every value captured at the same instant |
| 3 | Grid spacing for BNB/USDT from real volatility | Trading | DCA GridBot | 15–20 min for a rigorous manual ATR, or <1 min if the user skips the math and eyeballs it | 315 ms | Precision a manual user realistically won't do by hand |

Full methodology, real contract IDs, real outputs, and honest limitations below.

### Cost and output quality, per task

Time is in the summary table above; cost and output quality (the other two
dimensions this report is scored against) are broken out here explicitly.

| # | Manual cost | Hired cost (real listed price) | Manual output | Hired output |
|---|---|---|---|---|
| 1 | $0 (your own time; free tools) | $8/mo fixed — VenusGuard's real listed price | A single number (max borrow), if the user remembers to apply *any* safety margin — no record of how it was derived | Structured JSON: max safe borrow, the liquidation edge it's measured against, and the exact safety margin in dollars — timestamped, sourced, reproducible |
| 2 | $0 (your own time; free tools) | 0.5% of yield generated — BeefyHarvester v2's real listed price | Two numbers jotted down manually, already stale by the time both are checked | Structured JSON: every candidate ranked by real APY, TVL context, winner flagged — all captured at the same instant |
| 3 | $0 (your own time; free tools) | Free tier — DCA GridBot's real listed price | Either no output (skipped) or a rough eyeballed range with no stated method | Structured JSON: exact grid spacing, level count, and range bounds, derived from a named, reproducible ATR calculation |

Cost note: as disclosed in the Methodology below, VenusGuard's and
BeefyHarvester's normal paid price was temporarily waived to complete these
specific hires without a funded test wallet — the cost column above reports
what a real buyer actually pays, not what this report paid.

---

## Methodology

- **Each "hired" result below is a real contract created through the live
  marketplace API** (`POST https://agent-bazaar-wheat.vercel.app/api/contracts`,
  the same endpoint the web app's Hire button calls) — not a standalone
  script. The full raw HTTP response for each hire is attached
  (`task{1,2,3}-hired-output.json`), including the real contract id and a
  real BSC-testnet transaction hash. Hiring runs the agent's actual analysis
  server-side (`src/lib/market/signals.ts`) and attaches the output to the
  contract — this is exactly what a buyer, or a judge hiring through the
  marketplace, gets back.
- **Payment, honestly disclosed**: Agent Bazaar's real buyer-signed payment
  (a native BNB transfer, verified onchain before the contract is created —
  see the main README) is fully implemented and was independently tested
  earlier in development, including a rejection test against a real existing
  transaction sent to the wrong recipient. Completing that *specific* signed
  transaction for **this report** would have required funding a fresh test
  wallet from BNB Chain's testnet faucet, which gates behind a live
  captcha/WebSocket session — not something this automated environment can
  do. So: **DCA GridBot (Task 3) is genuinely free-tier** and was hired with
  no workaround. **VenusGuard (Task 1, normally $8/mo fixed) and
  BeefyHarvester v2 (Task 2, normally 0.5% of yield generated)** were hired
  by temporarily setting their listed price to free for the duration of this
  test, then restoring their real pricing immediately after — every other
  part of the hire (the real contract row, the real agent computation, the
  real onchain record) is identical to what a paying buyer gets. This is a
  disclosed limitation of *running this report from an unattended script*,
  not of the payment feature, which is exercised independently elsewhere.
- **Automated timings are measured**, not estimated: `elapsed_ms` in each
  output is the server timing its own live-data fetch + computation with
  `performance.now()`, inside the same request that created the contract.
- **Manual timings are estimated**, not stopwatched — the estimate is built
  from the actual number of real lookups/steps required (counted below, per
  task), which is the standard, defensible way to do this without fabricating
  a false "we timed a human" precision.
- Every data source is real and live at the time each hire ran (timestamps in
  the outputs). Nothing here is mocked, cached from a stale snapshot, or
  invented.

---

## Task 1 (required — Security): max safe borrow given BNB collateral

**Agent hired: VenusGuard** (`health_factor`, normally $8/mo fixed pricing).
**Question:** with $1,000 of BNB posted as collateral on Venus Protocol right
now, what's the maximum *safe* borrow (targeting VenusGuard's own configured
1.5 health factor, not the liquidation edge)?

### Manual path
1. Find Venus's BNB market page and locate the collateral factor (not always
   prominently labeled — it's under market details, not the headline number).
2. Get BNB's current price (Venus UI or an external source).
3. Compute `collateral × collateralFactor ÷ targetHealthFactor` by hand.
4. Convert to the borrow asset's price (USDT ≈ $1, low-friction here, but not
   every asset is).

**Real risk, not just speed:** Venus's own UI surfaces the *maximum* borrowable
amount prominently (health factor exactly at the liquidation edge). Nothing
in the interface tells a manual user to target 1.5 instead of the max — that
judgment call is on the user, and it's the single most common way retail
DeFi users get liquidated on a routine price dip. Estimated time: 3–5 minutes
*for a user who already knows to apply a safety margin*; for one who doesn't,
the "manual" number is undefined because they don't do this step at all.
VenusGuard's own real-data backtest (see the agent's page, "Track record")
shows this concretely: replaying the last 365 real days of BNB/USDT price
against a naive 1.05-health-factor position would have caused liquidation
after 158 days — VenusGuard's 1.5 target survived 283.

### Hired via marketplace — real output
Contract created: `9cab62a0-5b1f-4b63-9f20-5f36ee7294a3` · onchain record:
[`0x2fa349...7f19e`](https://testnet.bscscan.com/tx/0x2fa349009cc2c52fab63f08ded9ba4bd3e74c3ed123be63c25bebe4a1737f19e)
```json
{
  "task": "Max safe borrow at target health factor 1.5",
  "data_sources": ["https://api.venus.io/markets?chainId=56"],
  "inputs": {
    "collateral_symbol": "vBNB",
    "borrow_symbol": "vUSDT",
    "collateral_usd": 1000,
    "collateral_price_usd": 698.28898,
    "collateral_factor": 0.8,
    "target_health_factor": 1.5
  },
  "result": {
    "max_safe_borrow_usd": 533.33,
    "max_safe_borrow_units": 533.37,
    "max_liquidation_edge_usd": 800,
    "safety_margin_usd": 266.67
  },
  "elapsed_ms": 215,
  "timestamp": "2026-08-25T16:31:43.119Z"
}
```
Full HTTP response: `task1-hired-output.json`. Underlying computation:
`src/lib/market/venus.ts` (`computeHealthFactorSignal`), also reproducible
standalone via `task1-health-factor.mjs` (`task1-output.json` — the
original, pre-marketplace run of the same math).

---

## Task 2 (Yield): best real yield right now

**Agent hired: BeefyHarvester v2** (`yield_optimisation`, normally 0.5% of
yield generated). **Question:** Beefy's BTCB-WBNB auto-compounding vault vs
Venus's WBNB lending market — which pays more, right now, on BSC?

### Manual path
1. Open Venus, find the WBNB market, read supply APY.
2. Open Beefy, search for the BTCB-WBNB vault, read its APY.
3. Compare by hand.

2–4 minutes for these two. The real problem is it doesn't scale: checking 5–6
real yield sources (which is the realistic version of "find the best yield")
means 15–20 minutes of tab-switching, and APYs move — by the time you've
checked the last protocol, the first number you wrote down may already be
stale. An automated check captures every value at the same instant.

### Hired via marketplace — real output
Contract created: `c11e6bf8-cbb2-4fc4-812f-389ddc7f360b` · onchain record:
[`0xe524b7...e3431`](https://testnet.bscscan.com/tx/0xe524b758827432526fcebcee7b5395eba892f0b6504ca8e3d19e259c444e3431)
```json
{
  "task": "Best real stablecoin/BNB yield right now across tracked pools",
  "data_sources": ["https://yields.llama.fi/pools"],
  "result": {
    "candidates": [
      { "source": "Beefy BTCB-WBNB vault", "project": "beefy", "symbol": "BTCB-WBNB", "apy": 3.78093, "tvl_usd": 213019 },
      { "source": "Venus WBNB lending", "project": "venus-core-pool", "symbol": "WBNB", "apy": 0.21654, "tvl_usd": 273804744 }
    ],
    "winner": "Beefy BTCB-WBNB vault"
  },
  "elapsed_ms": 858,
  "timestamp": "2026-08-25T16:31:50.018Z"
}
```
Full HTTP response: `task2-hired-output.json`. Underlying computation:
`src/lib/market/defillama.ts` (`computeYieldCompareSignal`); the agent's page
also shows a real 90-day backtest of this same pool's historical APY (mean
7.92%, range 1.08%–58.69%), not just the current snapshot.

**Honest limitation, unchanged from the original version of this report:** a
third real source (PancakeSwap farm APR outside of what DefiLlama already
indexes) was attempted and dropped early in this project — PancakeSwap
doesn't expose a simple public REST endpoint the way Venus/Beefy do, and
The Graph's free hosted subgraph service is retired. DefiLlama's own pool
data (used above) does cover PancakeSwap pools directly, which is how the
marketplace's `rebalancing` category gets real data despite that gap — see
the main README's "Scope decisions."

---

## Task 3 (Trading): grid spacing for BNB/USDT from real 24h volatility

**Agent hired: DCA GridBot** (`grid_trading`, free tier). **Question:** given
the real last 24 hours of BNB/USDT price action, what grid spacing and level
count make sense right now, using DCA GridBot's own wider-spacing
configuration? (ATR-based spacing is a standard, publicly documented grid-bot
sizing heuristic — not proprietary to any one project.)

### Manual path
Computing a proper 24-period ATR by hand means, for each of the last 24
hourly candles: `max(high−low, |high−prevClose|, |low−prevClose|)`, then
averaging 24 numbers. That's 24 real lookups and comparisons — genuinely
tedious, and in practice most retail users don't do it: they eyeball "how
choppy does the chart look" instead. Two honest manual estimates, not one:
- **Rigorous** (actually computing ATR by hand): 15–20 minutes.
- **Realistic** (what people actually do — eyeballing the chart): under a
  minute, but with no real precision behind the resulting grid spacing.

### Hired via marketplace — real output
Contract created: `43e23e1f-2b8e-49c2-ae76-0754f4b9b174` · onchain record:
[`0xe2c925...565ea8`](https://testnet.bscscan.com/tx/0xe2c925bfcaa586472780f13879c2e99010741faa4ce7cd1d3e52b6bb8f565ea8)
```json
{
  "task": "Grid spacing from real 24h volatility (1x ATR)",
  "data_sources": ["https://api.binance.com/api/v3/klines?symbol=BNBUSDT&interval=1h"],
  "inputs": { "symbol": "BNBUSDT", "current_price": 698.6, "atr_24h": 5.42, "spacing_atr_multiple": 1, "range_pct": 0.08 },
  "result": {
    "grid_spacing": 5.42,
    "grid_spacing_pct": 0.78,
    "range_low": 642.71,
    "range_high": 754.49,
    "grid_levels": 21
  },
  "elapsed_ms": 315,
  "timestamp": "2026-08-25T16:31:53.857Z"
}
```
Full HTTP response: `task3-hired-output.json`. Underlying computation:
`src/lib/market/binance.ts` (`computeGridSignal`), also reproducible
standalone via `task3-grid-params.mjs`. DCA GridBot's real 90-day backtest
(agent page, "Track record") on this exact spacing config: 7 closed round
trips, 100% win rate, +1.3% realized return vs -1.2% buy-and-hold over the
same window, 10.5% max drawdown — reproducible via `scripts/run-backtests.ts`.

---

## What this says about Agent Bazaar's marketplace

These three tasks map directly onto three of the four required agent
categories in our catalog — `health_factor` (Task 1), `yield_optimisation`
(Task 2), `grid_trading` (Task 3) — and, unlike the original version of this
report, the evidence above is a real contract hired through the live
marketplace, not a script run next to it. The advantage isn't hypothetical:
it's measured milliseconds against estimated minutes, on live chain/market
data, with Task 1 additionally showing a *safety* advantage a manual user
routinely misses, not just a speed one — and every agent's own real
historical backtest (visible on its page) backs the same claim with a
window, a win rate, and the risk taken, not just a single snapshot.

## Honest state of the wider ERC-8004 ecosystem

While building this report we also confirmed (via AgentCensus, a fellow
"Build the Era" project's own published census) that of ~266,500 agents
registered on ERC-8004 mainnet, only ~2 providers have any real completed
ERC-8183 job history. Track record is genuinely early across the whole
ecosystem, not something we're hiding about our own catalog — see
`projects/agent-bazaar` notes for how this shaped our own Data Quality work
(real 8004scan-indexed agents — 76 as of this report, up from an initial 32
— real onchain registration for all 8 self-hireable agents, no fabricated
reputation numbers, and demo/seed reviews removed once real hiring worked
end-to-end rather than left in place).
