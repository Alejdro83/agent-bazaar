/**
 * Registers the 8 self-hireable (source='user') agents on the ERC-8004
 * Identity Registry, using the same registerAgentOnchain() the live listing
 * flow (POST /api/agents) already uses for newly-listed agents. These 8 were
 * seeded directly into Postgres (supabase/seed.sql) and never went through
 * that flow, then had their identity nulled by migration 002 — so today they
 * fail the hackathon's own eligibility bar ("Agents surfaced on your
 * marketplace must be live on BSC"). This closes that gap for the demo
 * catalog specifically; new agents listed through the app already register
 * onchain automatically.
 *
 * Usage: npx tsx --env-file-if-exists=.env.local scripts/register-seed-agents.ts
 */

import { createServiceClient } from '../src/lib/supabase/service';
import { registerAgentOnchain, toJson } from '../src/lib/erc8004';

async function main() {
  const supabase = createServiceClient();
  const { data: agents, error } = await supabase
    .from('agents')
    .select('id, name, description, category, pricing_type, pricing_value, seller_id, wallet_address, erc8004_id')
    .eq('source', 'user')
    .eq('status', 'active')
    .is('erc8004_id', null);

  if (error || !agents) {
    console.error('Failed to fetch agents:', error);
    process.exit(1);
  }

  console.log(`${agents.length} agent(s) missing onchain identity.`);

  for (const agent of agents) {
    try {
      const pricingLabel =
        agent.pricing_type === 'free'
          ? 'Free'
          : agent.pricing_type === 'percentage'
          ? `${agent.pricing_value}% of yield`
          : `$${agent.pricing_value}/mo`;

      const registration = await registerAgentOnchain({
        agentDbId: agent.id,
        name: agent.name,
        description: agent.description,
        category: agent.category,
        sellerWallet: agent.wallet_address,
        pricingLabel,
      });

      const { error: updateError } = await supabase
        .from('agents')
        .update({
          erc8004_id: registration.agentId !== null ? String(registration.agentId) : null,
          erc8004_data: toJson(registration),
          onchain_tx_hash: registration.transactionHash,
        })
        .eq('id', agent.id);

      if (updateError) {
        console.error(`  ✗ ${agent.name}: saved onchain but failed to persist — ${updateError.message}`);
      } else {
        console.log(`  ✓ ${agent.name}: agent #${registration.agentId} — tx ${registration.transactionHash}`);
      }
    } catch (err) {
      console.error(`  ✗ ${agent.name}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
