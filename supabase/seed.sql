-- Seed data for Agent Bazaar hackathon demo
-- Run after schema.sql in Supabase SQL Editor
--
-- These are our OWN hireable demo listings (source='user'), 2 per required
-- hackathon category, for local dev/testing without needing an 8004scan sync.
-- Real ERC-8004 agents indexed from BSC (source='8004scan') are populated
-- separately by the sync pipeline (src/lib/eightoofourscan) and are
-- browse-only, not hireable — see supabase/schema.sql for the source column.

INSERT INTO agents (
  id, seller_id, name, description, category, subcategory,
  pricing_type, pricing_value, pricing_currency, wallet_address,
  erc8004_id, status, total_hires, avg_rating, total_revenue
) VALUES
-- rebalancing (2)
(
  '11111111-1111-1111-1111-111111111101',
  'demo_seller_1',
  'AutoRebalance',
  'Automatically rebalances your crypto portfolio to target allocations. Supports custom strategies, periodic rebalancing, and threshold-based triggers. Works with PancakeSwap and Venus.',
  'rebalancing',
  'portfolio',
  'percentage',
  0.2,
  'USD',
  '0x4567890123abcdef4567890123abcdef45678901',
  '0xpqr678pqr678pqr678pqr678pqr678pqr678pqr678pqr678pqr678pqr678pqr6',
  'active',
  93,
  4.4,
  4500
),
(
  '11111111-1111-1111-1111-111111111102',
  'demo_seller_2',
  'RangeKeeper',
  'Concentrated-liquidity range rebalancer for PancakeSwap V3. Monitors your position and rebalances automatically as price approaches a range boundary, minimizing time out of range.',
  'rebalancing',
  'concentrated-liquidity',
  'fixed',
  20,
  'USD',
  '0x2345678901abcdef2345678901abcdef23456789',
  '0xrng678rng678rng678rng678rng678rng678rng678rng678rng678rng678rng6',
  'active',
  61,
  4.6,
  1220
),

-- grid_trading (2)
(
  '11111111-1111-1111-1111-111111111103',
  'demo_seller_2',
  'GridBot Pro',
  'Runs automated grid trading strategies on PancakeSwap. Buy low, sell high within configurable price ranges. Supports BNB/USDT, CAKE/USDT, and 20+ pairs. Real-time PnL tracking.',
  'grid_trading',
  'grid',
  'fixed',
  25,
  'USD',
  '0x2345678901abcdef2345678901abcdef23456789',
  '0xdef456def456def456def456def456def456def456def456def456def456de4',
  'active',
  128,
  4.5,
  3200
),
(
  '11111111-1111-1111-1111-111111111104',
  'demo_seller_3',
  'DCA GridBot',
  'Combines grid trading with dollar-cost-averaged entries. Widens grid spacing in high volatility and tightens it in range-bound markets. Backtested on 12 months of BSC pair data.',
  'grid_trading',
  'dca-grid',
  'free',
  0,
  'USD',
  '0x3456789012abcdef3456789012abcdef34567890',
  '0xdca678dca678dca678dca678dca678dca678dca678dca678dca678dca678dca6',
  'active',
  0,
  0,
  0
),

-- yield_optimisation (2)
(
  '11111111-1111-1111-1111-111111111105',
  'demo_seller_1',
  'BeefyHarvester v2',
  'Automatically harvests and restakes yield across Venus, PancakeSwap, and Beefy protocols. Optimizes for highest APY with gas-efficient batching. Supports 15+ vaults with auto-compounding.',
  'yield_optimisation',
  'auto-compound',
  'percentage',
  0.5,
  'USD',
  '0x1234567890abcdef1234567890abcdef12345678',
  '0xabc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abc1',
  'active',
  340,
  4.8,
  12500
),
(
  '11111111-1111-1111-1111-111111111106',
  'demo_seller_2',
  'PancakeOptimizer',
  'Finds the best liquidity pools on PancakeSwap, manages LP positions, and auto-compounds CAKE rewards. Impermanent loss protection with dynamic rebalancing.',
  'yield_optimisation',
  'lp-management',
  'percentage',
  0.3,
  'USD',
  '0x2345678901abcdef2345678901abcdef23456789',
  '0xghi789ghi789ghi789ghi789ghi789ghi789ghi789ghi789ghi789ghi789ghi7',
  'active',
  215,
  4.6,
  8900
),

-- health_factor (2)
(
  '11111111-1111-1111-1111-111111111107',
  'demo_seller_1',
  'LiquidationShield',
  'Monitors your lending positions on Venus and Aave. Automatically adds collateral before liquidation threshold. Sends Telegram alerts 30min, 15min, and 5min before risk.',
  'health_factor',
  'risk-management',
  'fixed',
  10,
  'USD',
  '0x1234567890abcdef1234567890abcdef12345678',
  '0x789abc789abc789abc789abc789abc789abc789abc789abc789abc789abc789a',
  'active',
  512,
  4.9,
  5120
),
(
  '11111111-1111-1111-1111-111111111108',
  'demo_seller_4',
  'VenusGuard',
  'Real-time health factor monitoring for Venus Protocol positions. Auto-repays or adds collateral when health factor drops below your configured safety margin.',
  'health_factor',
  'auto-repay',
  'fixed',
  8,
  'USD',
  '0x4567890123abcdef4567890123abcdef45678901',
  '0xvng678vng678vng678vng678vng678vng678vng678vng678vng678vng678vng6',
  'active',
  44,
  4.7,
  352
);

-- Demo contracts (needed so ratings below have a real contract_id to reference)
INSERT INTO contracts (
  id, agent_id, buyer_id, seller_id, status,
  pricing_type, pricing_value, pricing_currency,
  payment_tx_hash, started_at, expires_at
) VALUES
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'demo_buyer_1', 'demo_seller_1', 'completed', 'percentage', 0.2, 'USD', '0xaa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa1', NOW() - INTERVAL '20 days', NULL),
('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111103', 'demo_buyer_2', 'demo_seller_2', 'completed', 'fixed', 25, 'USD', '0xbb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb2', NOW() - INTERVAL '15 days', NOW() + INTERVAL '15 days'),
('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111105', 'demo_buyer_3', 'demo_seller_1', 'completed', 'percentage', 0.5, 'USD', '0xcc33cc33cc33cc33cc33cc33cc33cc33cc33cc33cc33cc33cc33cc33cc33cc3', NOW() - INTERVAL '10 days', NULL),
('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111107', 'demo_buyer_4', 'demo_seller_1', 'completed', 'fixed', 10, 'USD', '0xdd44dd44dd44dd44dd44dd44dd44dd44dd44dd44dd44dd44dd44dd44dd44dd4', NOW() - INTERVAL '5 days', NOW() + INTERVAL '25 days');

-- Demo ratings, one per contract above
INSERT INTO ratings (contract_id, agent_id, rater_id, score, comment) VALUES
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'demo_buyer_1', 5, 'Rebalances exactly on schedule, no surprises.'),
('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111103', 'demo_buyer_2', 4, 'Solid grid performance, good documentation.'),
('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111105', 'demo_buyer_3', 5, 'Saved me a lot of manual harvesting. Highly recommended.'),
('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111107', 'demo_buyer_4', 5, 'Caught a liquidation risk I would have missed. Worth it.');

-- Recompute stats from the contracts/ratings above (keeps hardcoded totals honest)
SELECT update_agent_stats(id) FROM agents WHERE seller_id LIKE 'demo_seller_%';
