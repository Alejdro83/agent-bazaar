/**
 * Creates the real, hireable "PancakeRouter" agent — the PancakeSwap
 * Partner Challenge's swap-routing capability, now a genuine marketplace
 * agent instead of only a standalone script (see
 * pancakeswap-report/PANCAKESWAP_BENEFIT_REPORT.md). Registers it onchain
 * the same way any real listing does (registerAgentOnchain), via the
 * insert -> register -> activate flow POST /api/agents already uses.
 *
 * Usage: npx tsx --env-file-if-exists=.env.local scripts/create-pancake-router-agent.ts
 */

import { createServiceClient } from '../src/lib/supabase/service';
import { registerAgentOnchain, toJson } from '../src/lib/erc8004';

async function main() {
  const supabase = createServiceClient();

  const name = 'PancakeRouter';
  const description =
    "Finds the real best swap route and price across PancakeSwap's live pools before you trade, computed on-chain via PancakeSwap's own routing SDK (no subgraph, no API key). Shows genuine execution price, gas estimate, and route splits before you commit — a quote, never an executed transaction, so your funds are never at risk.";
  const walletAddress = '0xdd55dd55dd55dd55dd55dd55dd55dd55dd55dd5';

  const { data: draft, error: draftError } = await supabase
    .from('agents')
    .insert({
      seller_id: 'demo_seller_5',
      name,
      description,
      category: 'grid_trading',
      subcategory: 'swap-routing',
      pricing_type: 'free',
      pricing_value: 0,
      pricing_currency: 'USD',
      wallet_address: walletAddress,
      status: 'draft',
      metadata: {
        strategy: 'pancake_route',
        from_symbol: 'BNB',
        to_symbol: 'CAKE',
        amount_raw: '1000000000000000000', // 1 BNB
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
    category: 'grid_trading',
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

  console.log(`✓ PancakeRouter is live: ${agent.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
