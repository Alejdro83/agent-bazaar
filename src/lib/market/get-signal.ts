import type { SupabaseClient } from '@supabase/supabase-js';
import { NotFoundError } from '@/lib/errors';
import { computeAgentSignal } from './signals';

/**
 * Shared "get one agent's live signal" logic — used by
 * `GET /api/market/signal` and the `get_market_signal` MCP tool.
 */
export async function getAgentSignal(supabase: SupabaseClient, agentId: string) {
  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, category, metadata, status')
    .eq('id', agentId)
    .eq('status', 'active')
    .single();

  if (error || !agent) {
    throw new NotFoundError('Agent');
  }

  return computeAgentSignal(agent);
}
