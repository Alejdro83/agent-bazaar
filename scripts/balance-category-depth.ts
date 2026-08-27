/**
 * Adds 2 real, distinctly-strategied hireable agents each to rebalancing,
 * yield_optimisation and health_factor — closing a real, verifiable gap
 * against the hackathon's own literal criterion ("all four categories
 * surfaced with equal depth"): as of 2026-08-27, our own hireable agents
 * were grid_trading=4 / yield_optimisation=2 / health_factor=2 /
 * rebalancing=2. This brings every category to 4.
 *
 * Every new agent uses a genuinely different real pool/market than any
 * existing agent (checked against the live catalog before picking these),
 * not a near-duplicate — same "not a shared category-level fact"
 * principle as src/lib/market/signals.ts already documents.
 *
 * Usage: npx tsx --env-file-if-exists=.env.local scripts/balance-category-depth.ts
 * Then:  npx tsx --env-file-if-exists=.env.local scripts/run-backtests.ts
 *        (populates each new agent's real-data track record)
 */

import { createServiceClient } from '../src/lib/supabase/service';
import { registerAgentOnchain, toJson } from '../src/lib/erc8004';
import type { Json } from '../src/types/database';

const SELLER_WALLET = '0xdd55dd55dd55dd55dd55dd55dd55dd55dd55dd5'; // same platform seller as PancakeRouter

interface NewAgent {
  name: string;
  description: string;
  category: 'rebalancing' | 'yield_optimisation' | 'health_factor';
  subcategory: string;
  metadata: Record<string, unknown>;
}

const AGENTS: NewAgent[] = [
  {
    name: 'AaveRangeBot',
    description:
      "Suggests a concentrated-liquidity range width from Aave v3's own real WBNB pool volatility on BSC — a different lending protocol than this marketplace's existing Venus/PancakeSwap-backed rebalancing agents, for genuine cross-protocol comparison.",
    category: 'rebalancing',
    subcategory: 'concentrated-liquidity',
    metadata: {
      pool_id: '9380e5ac-3b75-468c-951c-c24ff6497e80', // aave-v3 WBNB, real DefiLlama pool, ~$81M TVL
      strategy: 'rebalancing',
      range_sigma_multiple: 1.0,
    },
  },
  {
    name: 'VenusBTCRanger',
    description:
      "Suggests a concentrated-liquidity range width from Venus's real BTCB market volatility on BSC — the marketplace's first rebalancing agent tracking a BTC-denominated pool rather than a BNB/stablecoin pair.",
    category: 'rebalancing',
    subcategory: 'concentrated-liquidity',
    metadata: {
      pool_id: '87c8ee0d-b812-47c1-803f-f91a3907079e', // venus-core-pool BTCB, real DefiLlama pool, ~$363M TVL
      strategy: 'rebalancing',
      range_sigma_multiple: 1.25,
    },
  },
  {
    name: 'BTCLendCompare',
    description:
      'Compares real BTC-collateral lending yield across two different BSC protocols (Venus vs Aave v3) and surfaces whichever pays more right now — the same "which protocol, not just which pool" comparison this marketplace already runs for BNB pairs, applied to BTC for the first time.',
    category: 'yield_optimisation',
    subcategory: 'lending-compare',
    metadata: {
      strategy: 'yield_optimisation',
      candidates: [
        { label: 'Venus BTCB lending', poolId: '87c8ee0d-b812-47c1-803f-f91a3907079e' },
        { label: 'Aave v3 BTCB lending', poolId: '45bfb85f-deb5-4990-b9c4-cfb99629e6e8' },
      ],
    },
  },
  {
    name: 'LiquidStakeCompare',
    description:
      'Compares real liquid-staking yield between two different assets on BSC — Lista\'s staked BNB (slisBNB) and Binance\'s staked ETH (WBETH) — surfacing whichever currently pays more, a genuinely different comparison from this marketplace\'s existing LP/lending yield agents.',
    category: 'yield_optimisation',
    subcategory: 'liquid-staking-compare',
    metadata: {
      strategy: 'yield_optimisation',
      candidates: [
        { label: 'Lista liquid-staked BNB (slisBNB)', poolId: '50bb5f69-85ea-4f70-81da-3661a1633fc4' },
        { label: 'Binance staked ETH (WBETH)', poolId: '566c64cb-c1ec-4027-bb67-1e9326d6d48a' },
      ],
    },
  },
  {
    name: 'EthHealthGuard',
    description:
      "Computes the real max safe borrow against ETH collateral on Venus, targeting a health factor of 1.6 — this marketplace's first health_factor agent tracking an ETH-collateral position rather than the existing BNB-collateral ones.",
    category: 'health_factor',
    subcategory: 'auto-repay',
    metadata: {
      strategy: 'health_factor',
      target_health_factor: 1.6,
      collateral_symbol: 'vETH',
      borrow_symbol: 'vUSDT',
      collateral_usd: 1000,
    },
  },
  {
    name: 'BtcVaultShield',
    description:
      'Computes the real max safe borrow against BTC collateral on Venus, targeting a conservative health factor of 2.2 — pairs BTC collateral with BUSD borrowing, a distinct real market from every other health_factor agent in this marketplace.',
    category: 'health_factor',
    subcategory: 'risk-management',
    metadata: {
      strategy: 'health_factor',
      target_health_factor: 2.2,
      collateral_symbol: 'vBTC',
      borrow_symbol: 'vBUSD',
      collateral_usd: 1000,
    },
  },
];

async function main() {
  const supabase = createServiceClient();

  for (const spec of AGENTS) {
    const { data: draft, error: draftError } = await supabase
      .from('agents')
      .insert({
        seller_id: 'demo_seller_5',
        name: spec.name,
        description: spec.description,
        category: spec.category,
        subcategory: spec.subcategory,
        pricing_type: 'free',
        pricing_value: 0,
        pricing_currency: 'USD',
        wallet_address: SELLER_WALLET,
        status: 'draft',
        metadata: spec.metadata as Json,
      })
      .select()
      .single();

    if (draftError || !draft) {
      console.error(`✗ ${spec.name}: failed to insert draft —`, draftError);
      continue;
    }

    try {
      const registration = await registerAgentOnchain({
        agentDbId: draft.id,
        name: spec.name,
        description: spec.description,
        category: spec.category,
        sellerWallet: SELLER_WALLET,
        pricingLabel: 'Free',
      });

      const { error: updateError } = await supabase
        .from('agents')
        .update({
          status: 'active',
          erc8004_id: registration.agentId !== null ? String(registration.agentId) : null,
          erc8004_data: toJson(registration),
          onchain_tx_hash: registration.transactionHash,
        })
        .eq('id', draft.id);

      if (updateError) {
        console.error(`✗ ${spec.name}: registered onchain but failed to activate —`, updateError);
      } else {
        console.log(`✓ ${spec.name} (${spec.category}): agent #${registration.agentId} — tx ${registration.transactionHash}`);
      }
    } catch (err) {
      console.error(`✗ ${spec.name}: onchain registration failed —`, err instanceof Error ? err.message : err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
