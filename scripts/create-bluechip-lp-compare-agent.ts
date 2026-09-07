/**
 * Creates the real, hireable "BluechipLPCompare" agent — a yield_optimisation
 * comparison agent that ranks real-time LP yield between two major-pair
 * PancakeSwap pools (BTCB-WBNB vs ETH-WBNB) and surfaces whichever is
 * genuinely paying more right now. Distinct from BTCLendCompare (BTC lending
 * across protocols), LiquidStakeCompare (liquid-staking assets), and
 * PancakeOptimizer (LP management with auto-compounding) — this agent is the
 * first to compare blue-chip LP pools head-to-head.
 *
 * Usage: npx tsx --env-file-if-exists=.env.local scripts/create-bluechip-lp-compare-agent.ts
 */

import { createServiceClient } from '../src/lib/supabase/service';
import { registerAgentOnchain, toJson } from '../src/lib/erc8004';

async function main() {
  const supabase = createServiceClient();

  const name = 'BluechipLPCompare';
  const description =
    "Compares real-time LP yield between two major-pair PancakeSwap pools — BTCB-WBNB vs ETH-WBNB — and surfaces whichever is genuinely paying more right now. Unlike this marketplace's other yield_optimisation agents (which compare Beefy-vs-Venus lending, LP-vs-lending, or BTC-lending-across-protocols), this agent pits the two biggest blue-chip PancakeSwap LP pairs directly against each other so you can see which one is actually earning more before you provide liquidity.";
  const walletAddress = '0xdd55dd55dd55dd55dd55dd55dd55dd55dd55dd7';

  const { data: draft, error: draftError } = await supabase
    .from('agents')
    .insert({
      seller_id: 'demo_seller_9',
      name,
      description,
      category: 'yield_optimisation',
      subcategory: 'lp-yield-compare',
      pricing_type: 'free',
      pricing_value: 0,
      pricing_currency: 'USD',
      wallet_address: walletAddress,
      status: 'draft',
      metadata: {
        strategy: 'yield_optimisation',
        candidates: [
          { label: 'PancakeSwap BTCB-WBNB LP', poolId: '11b41c5a-3811-4f85-858c-98257fdc5ba6' },
          { label: 'PancakeSwap ETH-WBNB LP', poolId: 'f6b2ec4d-e94f-4c7b-b7a1-303de1428b57' },
        ],
      },
    })
    .select()
    .single();

  if (draftError || !draft) {
    console.error('Failed to insert draft agent:', draftError);
    process.exit(1);
  }
  console.log(`Draft created: ${draft.id}`);

  const registration = await registerAgentOnchain({
    agentDbId: draft.id,
    name,
    description,
    category: 'yield_optimisation',
    sellerWallet: walletAddress,
    pricingLabel: 'Free',
  });
  console.log(`Registered onchain: agent #${registration.agentId} — tx ${registration.transactionHash}`);

  const { data: agent, error: updateError } = await supabase
    .from('agents')
    .update({
      status: 'active',
      erc8004_id: registration.agentId !== null ? String(registration.agentId) : null,
      erc8004_data: toJson(registration),
      onchain_tx_hash: registration.transactionHash,
    })
    .eq('id', draft.id)
    .select()
    .single();

  if (updateError || !agent) {
    console.error('Failed to activate agent after onchain registration:', updateError);
    process.exit(1);
  }

  console.log(`✓ BluechipLPCompare is live: ${agent.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
