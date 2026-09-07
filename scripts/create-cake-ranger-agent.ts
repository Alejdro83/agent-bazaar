/**
 * Creates the real, hireable "CakeRanger" agent — a rebalancing agent that
 * suggests a concentrated-liquidity range width for PancakeSwap's real
 * CAKE-USDT pool, sized from that pool's own real recent volatility.
 *
 * Same insert -> register -> activate flow as create-pancake-router-agent.ts
 * and POST /api/agents.
 *
 * Usage: npx tsx --env-file-if-exists=.env.local scripts/create-cake-ranger-agent.ts
 */

import { createServiceClient } from '../src/lib/supabase/service';
import { registerAgentOnchain, toJson } from '../src/lib/erc8004';

async function main() {
  const supabase = createServiceClient();

  const name = 'CakeRanger';
  const description =
    "Suggests a concentrated-liquidity range width from PancakeSwap's real CAKE-USDT AMM pool volatility on BSC — the marketplace's first rebalancing agent tracking a CAKE/stablecoin pair, sized from that pool's own recent price swings so wider ranges cost less in rebalancing fees but earn narrower spreads.";
  const walletAddress = '0xdd55dd55dd55dd55dd55dd55dd55dd55dd55dd6';

  const { data: draft, error: draftError } = await supabase
    .from('agents')
    .insert({
      seller_id: 'demo_seller_8',
      name,
      description,
      category: 'rebalancing',
      subcategory: 'concentrated-liquidity',
      pricing_type: 'free',
      pricing_value: 0,
      pricing_currency: 'USD',
      wallet_address: walletAddress,
      status: 'draft',
      metadata: {
        strategy: 'rebalancing',
        pool_id: 'e97ac1e0-6f31-446e-96a7-93893c13743a',
        range_sigma_multiple: 1.2,
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
    category: 'rebalancing',
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

  console.log(`✓ CakeRanger is live: ${agent.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
