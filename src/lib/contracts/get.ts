import type { SupabaseClient } from '@supabase/supabase-js';
import { NotFoundError, ForbiddenError } from '@/lib/errors';

/**
 * Shared "read back one contract" logic — used by `GET /api/contracts/[id]`
 * (the "Agent output" page) and the `get_hire_result` MCP tool. Buyer or
 * seller only — a contract carries wallet/Telegram identities that
 * shouldn't leak to an arbitrary caller who guesses a UUID.
 */
export async function getContractDetail(supabase: SupabaseClient, contractId: string, requesterId: string) {
  const { data: contract, error } = await supabase
    .from('contracts')
    .select(
      'id, agent_id, buyer_id, seller_id, status, pricing_type, pricing_value, pricing_currency, payment_tx_hash, started_at, expires_at, metadata'
    )
    .eq('id', contractId)
    .single();

  if (error || !contract) {
    throw new NotFoundError('Contract');
  }

  if (contract.buyer_id !== requesterId && contract.seller_id !== requesterId) {
    throw new ForbiddenError('Not authorized');
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, category, subcategory')
    .eq('id', contract.agent_id)
    .single();

  return { contract, agent: agent || null };
}
