/**
 * Creates "X402PayBot" — the real, hireable x402/B402 payment demo agent
 * (see src/lib/x402/merchant.ts, src/lib/contracts/hire.ts's
 * hireAgentViaX402()). Its "deliverable" is the mechanism itself: hiring
 * it executes a real, self-hosted, gasless x402 settlement and returns
 * the verified on-chain receipt — not a market signal like every other
 * agent, since what it demonstrates IS the payment rail.
 *
 * Usage: npx tsx --env-file-if-exists=.env.local scripts/create-x402-paybot-agent.ts
 */

import { createServiceClient } from '../src/lib/supabase/service';
import { registerAgentOnchain, toJson } from '../src/lib/erc8004';

async function main() {
  const supabase = createServiceClient();

  const name = 'X402PayBot';
  const description =
    'Hiring this agent settles a real, gasless x402/B402 payment on BSC testnet — an EIP-3009 authorization you sign off-chain, verified and broadcast on-chain by a self-hosted facilitator (no third-party facilitator dependency, no tBNB needed to pay). The deliverable is the mechanism itself: a real, BscScan-verifiable settlement transaction, returned immediately.';
  const walletAddress = '0xdd55dd55dd55dd55dd55dd55dd55dd55dd55dd5'; // same platform seller as PancakeRouter/balance-category-depth agents

  const { data: draft, error: draftError } = await supabase
    .from('agents')
    .insert({
      seller_id: 'demo_seller_5',
      name,
      description,
      category: 'grid_trading',
      subcategory: 'x402-payment',
      pricing_type: 'fixed',
      pricing_value: 0.1,
      pricing_currency: 'U', // real testnet $U, not USD — see README's Scope decisions
      wallet_address: walletAddress,
      status: 'draft',
      metadata: {
        payment_rail: 'x402',
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
    pricingLabel: '0.1 U (x402, gasless)',
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

  console.log(`✓ X402PayBot is live: ${agent.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
