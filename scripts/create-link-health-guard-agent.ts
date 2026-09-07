/**
 * Creates the real, hireable "SolHealthGuard" agent — computes the max
 * safe amount to borrow against SOL collateral on Venus Protocol while
 * keeping a target health factor of 1.8, using Venus's own live market
 * data. Tracks vSOL collateral paired with vFDUSD borrowing, a distinct
 * real market from every other health_factor agent in this marketplace
 * (existing ones use vBNB, vBTC, or vETH as collateral).
 *
 * Originally built as "LinkHealthGuard" (vLINK collateral) but Venus's own
 * live market data (collateralFactorMantissa) shows LINK currently has a
 * 0% collateral factor on Venus — canBeCollateral is effectively moot, so
 * every real computation returns $0 max safe borrow. Not fabricated (it's
 * the real, honest answer), but useless as a demo — swapped to vSOL
 * (real collateral factor 0.65, confirmed live via
 * https://api.venus.io/markets?chainId=56 on 2026-09-07) before ever
 * registering onchain, so no stale identity exists under the old name.
 *
 * Usage: npx tsx --env-file-if-exists=.env.local scripts/create-link-health-guard-agent.ts
 */

import { createServiceClient } from '../src/lib/supabase/service';
import { registerAgentOnchain, toJson } from '../src/lib/erc8004';

async function main() {
  const supabase = createServiceClient();

  const name = 'SolHealthGuard';
  const description =
    "Computes the real max safe borrow against SOL collateral on Venus, targeting a health factor of 1.8 — tracks the vSOL collateral market paired with vFDUSD borrowing, a distinct real Venus market from every other health_factor agent in this marketplace (which use vBNB, vBTC, or vETH as collateral). Uses Venus's own live market data to calculate the maximum safe borrow amount, the liquidation edge, and the safety margin in dollars.";
  const walletAddress = '0xdd55dd55dd55dd55dd55dd55dd55dd55dd55dd8';

  const { data: draft, error: draftError } = await supabase
    .from('agents')
    .insert({
      seller_id: 'demo_seller_10',
      name,
      description,
      category: 'health_factor',
      subcategory: 'risk-management',
      pricing_type: 'free',
      pricing_value: 0,
      pricing_currency: 'USD',
      wallet_address: walletAddress,
      status: 'draft',
      metadata: {
        strategy: 'health_factor',
        collateral_symbol: 'vSOL',
        borrow_symbol: 'vFDUSD',
        collateral_usd: 1000,
        target_health_factor: 1.8,
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
    category: 'health_factor',
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

  console.log(`✓ SolHealthGuard is live: ${agent.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
