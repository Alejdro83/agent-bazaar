import type { SupabaseClient } from '@supabase/supabase-js';
import { NotFoundError } from '@/lib/errors';

/**
 * Shared "get one agent" logic — used by `GET /api/agents/[id]` and the
 * `get_agent` MCP tool.
 */
export async function getAgentDetail(supabase: SupabaseClient, id: string) {
  const { data: agent, error } = await supabase
    .from('agents')
    .select(
      'id, name, description, category, subcategory, pricing_type, pricing_value, pricing_currency, wallet_address, status, avatar_url, total_hires, avg_rating, total_revenue, source, chain_id, is_testnet, onchain_reputation, external_agent_id, erc8004_id, erc8004_data, onchain_tx_hash, metadata, created_at'
    )
    .eq('id', id)
    .single();

  if (error || !agent) {
    throw new NotFoundError('Agent');
  }

  // rater_id excluded (PII, not needed to render/consume a review).
  const { data: ratings } = await supabase
    .from('ratings')
    .select('id, score, comment, created_at')
    .eq('agent_id', id)
    .order('created_at', { ascending: false })
    .limit(10);

  return { agent, ratings: ratings || [] };
}
