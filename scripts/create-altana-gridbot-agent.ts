/**
 * Creates the real, hireable "AltanaGridBot" agent — the Altana Partner
 * Challenge's capability: hiring it grants a real, self-custodial Altana
 * session (BSC testnet) scoped to a call allowlist, a native spend cap, and
 * an expiry, registered in the public onchain KeyStore registry, which the
 * buyer can then view and revoke from the app. See `src/lib/altana/index.ts`
 * for the session mechanics and `src/app/api/altana/{grant,revoke}/route.ts`
 * for how a hire wires into a grant.
 *
 * Registers it onchain the same way `scripts/create-pancake-router-agent.ts`
 * did for PancakeRouter: draft insert -> registerAgentOnchain -> activate.
 *
 * Usage: npx tsx --env-file-if-exists=.env.local scripts/create-altana-gridbot-agent.ts
 */

import { createServiceClient } from '../src/lib/supabase/service';
import { registerAgentOnchain, toJson } from '../src/lib/erc8004';

async function main() {
  const supabase = createServiceClient();

  const name = 'AltanaGridBot';
  const description =
    "Hiring this agent grants a real, self-custodial Altana session on BSC testnet — not a mock. " +
    "The session is scoped to a call allowlist (the PancakeSwap testnet router only), a native BNB " +
    "spend cap, and an expiry, and is registered in Altana's public onchain KeyStore registry so " +
    "any app can verify its authority without trusting this listing's word for it. Within those " +
    "limits, real capped swaps execute through the session key, never the admin key. You can view " +
    "the exact permissions and revoke the session at any time from this hire's page — revocation is " +
    "one transaction and takes effect immediately.";

  // The dedicated Altana demo wallet (see .env.local's ALTANA_DEMO_WALLET_PRIVATE_KEY /
  // altana-report/NEXT_STEPS.md) — this IS the wallet whose sessions get granted on hire,
  // shown here rather than an arbitrary filler address because it's genuinely what backs this listing.
  const walletAddress = '0x8d147CFFBb304d57C744b4f8DB7Eb266c8e0Aa25';

  const { data: draft, error: draftError } = await supabase
    .from('agents')
    .insert({
      seller_id: 'demo_seller_6',
      name,
      description,
      category: 'grid_trading',
      subcategory: 'altana-session',
      pricing_type: 'free',
      pricing_value: 0,
      pricing_currency: 'USD',
      wallet_address: walletAddress,
      status: 'draft',
      metadata: {
        // Deliberately NOT 'pancake_route' or any strategy the grid_trading
        // switch case in src/lib/market/signals.ts checks for — this agent's
        // real value is the session/execution mechanism, not a market read,
        // so it's excluded from the Live Signal card entirely (see the
        // `altana_session_agent` guard in src/app/page.tsx and
        // src/app/agent/[id]/page.tsx) rather than given a misleading
        // generic grid-spacing number.
        strategy: 'altana_session_demo',
        // Marks this agent (and only this one) as eligible for
        // POST /api/altana/grant — see that route's validation.
        altana_session_agent: true,
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

  console.log(`✓ AltanaGridBot is live: ${agent.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
