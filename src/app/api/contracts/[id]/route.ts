import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { identifyRequester } from '@/lib/auth/identify';

/**
 * GET /api/contracts/[id] — Read back one contract, including the agent's
 * real analysis output (contracts.metadata.output — see POST /api/contracts).
 * This is the "Agent output" screen a buyer lands on right after hiring.
 * Buyer or seller only — a contract carries wallet/Telegram identities that
 * shouldn't leak to an arbitrary caller who guesses a UUID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const requester = identifyRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Auth required' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = createServiceClient();

    const { data: contract, error } = await supabase
      .from('contracts')
      .select(
        'id, agent_id, buyer_id, seller_id, status, pricing_type, pricing_value, pricing_currency, payment_tx_hash, started_at, expires_at, metadata'
      )
      .eq('id', id)
      .single();

    if (error || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    if (contract.buyer_id !== requester.id && contract.seller_id !== requester.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { data: agent } = await supabase
      .from('agents')
      .select('id, name, category, subcategory')
      .eq('id', contract.agent_id)
      .single();

    return NextResponse.json({ contract, agent: agent || null });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
