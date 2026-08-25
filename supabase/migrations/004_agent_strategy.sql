-- Fase 1 (Data Quality): give each of the 8 self-hireable agents its own
-- strategy config in the already-existing (previously unused) `metadata`
-- JSONB column. Combined at request time with live Venus/Binance/DefiLlama
-- data (see src/lib/market/signals.ts) so two agents in the same category
-- show different, real numbers instead of a shared category-level fact —
-- same principle already applied when building the Arena (see
-- src/app/api/arena/route.ts's CATEGORY_RISK_PROFILE caveat).

-- health_factor: distinct target health factors → genuinely different max-safe-borrow numbers
UPDATE agents SET metadata = '{"strategy": "health_factor", "target_health_factor": 2.0}'::jsonb
WHERE id = '11111111-1111-1111-1111-111111111107'; -- LiquidationShield (conservative)

UPDATE agents SET metadata = '{"strategy": "health_factor", "target_health_factor": 1.5}'::jsonb
WHERE id = '11111111-1111-1111-1111-111111111108'; -- VenusGuard

-- grid_trading: different spacing multiples / range widths
UPDATE agents SET metadata = '{"strategy": "grid_trading", "symbol": "BNBUSDT", "spacing_atr_multiple": 0.5, "range_pct": 0.05}'::jsonb
WHERE id = '11111111-1111-1111-1111-111111111103'; -- GridBot Pro (tight grid)

UPDATE agents SET metadata = '{"strategy": "grid_trading", "symbol": "BNBUSDT", "spacing_atr_multiple": 1.0, "range_pct": 0.08}'::jsonb
WHERE id = '11111111-1111-1111-1111-111111111104'; -- DCA GridBot (wider, fewer levels)

-- yield_optimisation: each agent tracks its own candidate pool set (real DefiLlama pool ids on BSC)
UPDATE agents SET metadata = '{"strategy": "yield_optimisation", "candidates": [
  {"label": "Beefy BTCB-WBNB vault", "poolId": "7d57a4fe-bb15-40bb-a254-1e85e706c760"},
  {"label": "Venus WBNB lending", "poolId": "747b58ab-aefd-42e1-a312-01ad5a0ab7f5"}
]}'::jsonb
WHERE id = '11111111-1111-1111-1111-111111111105'; -- BeefyHarvester v2

UPDATE agents SET metadata = '{"strategy": "yield_optimisation", "candidates": [
  {"label": "PancakeSwap CAKE-WBNB LP", "poolId": "32038bbe-b72d-49ab-aa17-37d61d44c579"},
  {"label": "PancakeSwap WBNB-BUSD LP", "poolId": "1ba6ccca-7122-47ce-854e-06883f9b2897"},
  {"label": "Venus USDT lending", "poolId": "9f3a6015-5045-4471-ba65-ad3dc7c38269"}
]}'::jsonb
WHERE id = '11111111-1111-1111-1111-111111111106'; -- PancakeOptimizer

-- rebalancing: each agent tracks its own PancakeSwap pool + range aggressiveness
UPDATE agents SET metadata = '{"strategy": "rebalancing", "pool_id": "1ba6ccca-7122-47ce-854e-06883f9b2897", "range_sigma_multiple": 1.5}'::jsonb
WHERE id = '11111111-1111-1111-1111-111111111101'; -- AutoRebalance (wider, portfolio-style)

UPDATE agents SET metadata = '{"strategy": "rebalancing", "pool_id": "32038bbe-b72d-49ab-aa17-37d61d44c579", "range_sigma_multiple": 0.75}'::jsonb
WHERE id = '11111111-1111-1111-1111-111111111102'; -- RangeKeeper (narrower, concentrated-liquidity)
