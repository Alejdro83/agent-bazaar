# Agent Advantage Report — Agent Bazaar

Submitted for the TermiX track, BNB Chain "Build the Era" hackathon (Aug 5 – Sep 9, 2026).

## Summary

Three real DeFi tasks on BNB Smart Chain, each run two ways — the manual path a
user takes today, and an automated path using real, live public data (Venus
Protocol's API, Beefy's API, Binance's market API — no synthetic data, no
mocked numbers). Task 1 is the required trading/security task.

| # | Task | Category | Manual (est.) | Automated (measured) | Real advantage |
|---|---|---|---|---|---|
| 1 | Max safe borrow given BNB collateral | **Security** | 3–5 min, *and* commonly skips the safety margin entirely | 352 ms | Speed **and** a safety margin a manual user typically omits |
| 2 | Best real stablecoin yield (Venus vs Beefy) | Yield | 2–4 min per protocol checked, values go stale mid-comparison | 616 ms | Speed, and every value captured at the same instant |
| 3 | Grid spacing for BNB/USDT from real volatility | Trading | 15–20 min for a rigorous manual ATR, or <1 min if the user skips the math and eyeballs it | 416 ms | Precision a manual user realistically won't do by hand |

Full methodology, real outputs, and honest limitations below.

---

## Methodology

- **Automated timings are measured**, not estimated: each task script times its
  own `fetch()` + computation with `performance.now()`, printed in its own
  output (see `task*-output.json` in this folder, timestamps included).
- **Manual timings are estimated**, not stopwatched — we did not simulate a
  full click-by-click UI session. The estimate is built from the actual
  number of real lookups/steps required (counted below, per task), which is
  the standard, defensible way to estimate this without fabricating a false
  "we timed a human" precision we don't have.
- Every data source is real and live at the time each script ran (timestamps
  in the outputs). Nothing here is mocked, cached from a stale snapshot, or
  invented.

---

## Task 1 (required — Security): max safe borrow given BNB collateral

**Question:** with $1,000 of BNB posted as collateral on Venus Protocol right
now, what's the maximum *safe* borrow (targeting a 1.5 health factor, not the
liquidation edge)?

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

### Automated path — real output
```json
{
  "task": "Max safe borrow given $1000 BNB collateral (target health factor 1.5)",
  "data_source": "https://api.venus.io/markets?chainId=56 (live, fetched at run time)",
  "inputs": {
    "collateral_usd": 1000,
    "target_health_factor": 1.5,
    "bnb_price_usd": 701.7663629010257,
    "bnb_collateral_factor": 0.8,
    "usdt_price_usd": 0.9998392529966591
  },
  "result": {
    "bnb_collateral_amount": 1.4249756797491817,
    "max_safe_borrow_usd": 533.3333333333334,
    "max_safe_borrow_usdt": 533.4190788517836
  },
  "elapsed_ms": 352,
  "timestamp": "2026-08-24T12:11:12.147Z"
}
```
Script: `task1-health-factor.mjs`.

---

## Task 2 (Yield): best real stablecoin yield right now

**Question:** Venus USDT lending vs a Beefy auto-compounding stablecoin vault
(USDT-USDC) — which pays more, right now, on BSC?

### Manual path
1. Open Venus, find the USDT market, read supply APY.
2. Open Beefy, search for a USDT-USDC vault, read its APY.
3. Compare by hand.

2–4 minutes for these two. The real problem is it doesn't scale: checking 5–6
real yield sources (which is the realistic version of "find the best yield")
means 15–20 minutes of tab-switching, and APYs move — by the time you've
checked the last protocol, the first number you wrote down may already be
stale. An automated check captures every value at the same instant.

### Automated path — real output
```json
{
  "task": "Best real stablecoin yield right now: Venus lending vs Beefy vault",
  "data_sources": [
    "https://api.venus.io/markets?chainId=56 (live)",
    "https://api.beefy.finance/apy + /vaults (live)"
  ],
  "candidates": [
    { "source": "Venus (USDT supply)", "apy": 0.0235851288 },
    { "source": "Beefy (USDT-USDC auto-compound)", "apy": 0.00006462342023683121 }
  ],
  "winner": "Venus (USDT supply)",
  "elapsed_ms": 616,
  "timestamp": "2026-08-24T12:12:16.539Z"
}
```
Script: `task2-yield-compare.mjs`.

**Honest limitation:** a third real source (PancakeSwap farm APR) was
attempted and dropped. PancakeSwap doesn't expose a simple public REST
endpoint for this the way Venus and Beefy do (confirmed: our guessed
endpoints 404'd, and their subgraph now sits behind The Graph's paid gateway
since the free hosted service was retired). Two genuinely free, live,
no-key-required sources beat a third one faked to look real.

---

## Task 3 (Trading): grid spacing for BNB/USDT from real 24h volatility

**Question:** given the real last 24 hours of BNB/USDT price action, what
grid spacing and level count make sense right now? (ATR-based spacing is a
standard, publicly documented grid-bot sizing heuristic — not proprietary to
any one project.)

### Manual path
Computing a proper 24-period ATR by hand means, for each of the last 24
hourly candles: `max(high−low, |high−prevClose|, |low−prevClose|)`, then
averaging 24 numbers. That's 24 real lookups and comparisons — genuinely
tedious, and in practice most retail users don't do it: they eyeball "how
choppy does the chart look" instead. Two honest manual estimates, not one:
- **Rigorous** (actually computing ATR by hand): 15–20 minutes.
- **Realistic** (what people actually do — eyeballing the chart): under a
  minute, but with no real precision behind the resulting grid spacing.

### Automated path — real output
```json
{
  "task": "Grid spacing + level count for BNB/USDT given real last-24h volatility",
  "data_source": "https://api.binance.com/api/v3/klines (live, 1h candles)",
  "inputs": {
    "current_price_usdt": 702.27,
    "atr_24h_usdt": 5.284166666666654,
    "spacing_atr_multiple": 0.5,
    "range_pct": 0.05
  },
  "result": {
    "grid_spacing_usdt": 2.642083333333327,
    "grid_spacing_pct": 0.37622044702654633,
    "range_low_usdt": 667.1564999999999,
    "range_high_usdt": 737.3835,
    "grid_levels": 27
  },
  "elapsed_ms": 416,
  "timestamp": "2026-08-24T12:12:36.324Z"
}
```
Script: `task3-grid-params.mjs`.

---

## What this says about Agent Bazaar's marketplace

These three tasks map directly onto three of the four required agent
categories in our catalog — `health_factor` (Task 1), `yield_optimisation`
(Task 2), `grid_trading` (Task 3) — the real, everyday jobs the agents listed
in our marketplace exist to do. The advantage isn't hypothetical: it's
measured milliseconds against estimated minutes, on live chain/market data,
with Task 1 additionally showing a *safety* advantage a manual user routinely
misses, not just a speed one.

## Honest state of the wider ERC-8004 ecosystem

While building this report we also confirmed (via AgentCensus, a fellow
"Build the Era" project's own published census) that of ~266,500 agents
registered on ERC-8004 mainnet, only ~2 providers have any real completed
ERC-8183 job history. Track record is genuinely early across the whole
ecosystem, not something we're hiding about our own catalog — see
`projects/agent-bazaar` notes for how this shaped our own Data Quality work
(real 8004scan-indexed agents, real onchain registration, no fabricated
reputation numbers).
