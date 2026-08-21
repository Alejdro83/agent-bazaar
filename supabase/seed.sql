-- Seed data for Agent Bazaar hackathon demo
-- Run after schema.sql in Supabase SQL Editor

-- Demo seller wallets (BSC Testnet addresses)
-- In production, these would be real wallet addresses from Telegram users

INSERT INTO agents (
  seller_id, name, description, category, subcategory,
  pricing_type, pricing_value, pricing_currency, wallet_address,
  erc8004_id, status, total_hires, avg_rating, total_revenue
) VALUES
-- 1. Yield Harvester
(
  'demo_seller_1',
  'BeefyHarvester v2',
  'Automatically harvests and restakes yield across Venus, PancakeSwap, and Beefy protocols. Optimizes for highest APY with gas-efficient batching. Supports 15+ vaults with auto-compounding.',
  'yield',
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

-- 2. Grid Trading Bot
(
  'demo_seller_2',
  'GridBot Pro',
  'Runs automated grid trading strategies on PancakeSwap. Buy low, sell high within configurable price ranges. Supports BNB/USDT, CAKE/USDT, and 20+ pairs. Real-time PnL tracking.',
  'trading',
  'grid',
  'fixed',
  25,
  'USD',
  '0x2345678901abcdef2345678901abcdef23456789',
  '0xdef456def456def456def456def456def456def456def456def456def456def4',
  'active',
  128,
  4.5,
  3200
),

-- 3. Liquidation Shield
(
  'demo_seller_1',
  'LiquidationShield',
  'Monitors your lending positions on Venus and Aave. Automatically adds collateral before liquidation threshold. Sends Telegram alerts 30min, 15min, and 5min before risk.',
  'defi',
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

-- 4. Whale Tracker
(
  'demo_seller_3',
  'WhaleTracker',
  'Real-time alerts when large wallets move BNB, USDT, or top tokens. Know what smart money does before everyone else. Tracks 500+ whale wallets with ML-based classification.',
  'monitoring',
  'whale-alerts',
  'free',
  0,
  'USD',
  '0x3456789012abcdef3456789012abcdef34567890',
  '0x456def456def456def456def456def456def456def456def456def456def456d',
  'active',
  890,
  4.2,
  0
),

-- 5. PancakeSwap Optimizer
(
  'demo_seller_2',
  'PancakeOptimizer',
  'Finds the best liquidity pools on PancakeSwap, manages LP positions, and auto-compounds CAKE rewards. Impermanent loss protection with dynamic rebalancing.',
  'yield',
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

-- 6. Gas Guardian
(
  'demo_seller_4',
  'GasGuard',
  'Optimizes transaction timing to minimize gas costs. Batches transactions and waits for low-congestion periods. Saves up to 40% on gas fees for frequent traders.',
  'analytics',
  'gas-optimization',
  'free',
  0,
  'USD',
  '0x4567890123abcdef4567890123abcdef45678901',
  '0xjkl012jkl012jkl012jkl012jkl012jkl012jkl012jkl012jkl012jkl012jkl',
  'active',
  67,
  4.0,
  0
),

-- 7. MEV Protector
(
  'demo_seller_3',
  'MEVShield',
  'Protects your transactions from sandwich attacks and frontrunning. Uses private mempools and commit-reveal schemes. Essential for DEX traders.',
  'defi',
  'mev-protection',
  'fixed',
  15,
  'USD',
  '0x3456789012abcdef3456789012abcdef34567890',
  '0xmno345mno345mno345mno345mno345mno345mno345mno345mno345mno345mno',
  'active',
  156,
  4.7,
  2340
),

-- 8. Portfolio Rebalancer
(
  'demo_seller_4',
  'AutoRebalance',
  'Automatically rebalances your crypto portfolio to target allocations. Supports custom strategies, periodic rebalancing, and threshold-based triggers. Works with PancakeSwap and Venus.',
  'trading',
  'rebalancing',
  'percentage',
  0.2,
  'USD',
  '0x4567890123abcdef4567890123abcdef45678901',
  '0xpqr678pqr678pqr678pqr678pqr678pqr678pqr678pqr678pqr678pqr678pqr',
  'active',
  93,
  4.4,
  4500
);

-- Add search embeddings (mock — in production, generate with OpenAI embeddings)
-- These are placeholder vectors for demo
INSERT INTO search_embeddings (agent_id, embedding, content)
SELECT
  id,
  ARRAY_FILL(0.1, ARRAY[1536])::vector,
  name || ' ' || description || ' ' || category
FROM agents
WHERE seller_id LIKE 'demo_seller_%';

-- Add some demo ratings
INSERT INTO ratings (contract_id, agent_id, rater_id, score, comment)
SELECT
  gen_random_uuid(),
  a.id,
  'demo_rater_' || (ROW_NUMBER() OVER ())::text,
  (4 + RANDOM())::int,
  CASE (ROW_NUMBER() OVER ()) % 4
    WHEN 0 THEN 'Great agent, works perfectly!'
    WHEN 1 THEN 'Saved me a lot of gas fees. Highly recommended.'
    WHEN 2 THEN 'Solid performance, good documentation.'
    ELSE 'Best agent in its category. Will use again.'
  END
FROM agents a
WHERE a.seller_id LIKE 'demo_seller_%'
LIMIT 8;
