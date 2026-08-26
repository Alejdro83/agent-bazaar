import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { identifyRequester } from '@/lib/auth/identify';
import { summarizeSessionEnvelope } from '@/lib/altana/session-envelope';
import { handleApiError } from '@/lib/errors';

/**
 * GET /api/altana/session/[contractId] — Real, live status of a contract's
 * Altana session: active / expired / revoked, plus the real permissions it
 * was granted (call allowlist, spend cap, expiry) — never the session's raw
 * serialized form (that carries key material; see
 * src/lib/altana/session-envelope.ts).
 *
 * A separate route rather than folding this into `GET /api/contracts/[id]`
 * (which we could have — that route already returns `contract.metadata`)
 * specifically so `altana_session_key` never has to be added to that
 * shared, more widely-used response shape (it also backs the
 * `get_hire_result` MCP tool) — keeping the secret-bearing column's only
 * server-side reader narrowly scoped here.
 *
 * Buyer or seller only, same bar as the rest of the contract-detail surface.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contractId: string }> }
) {
  try {
    const requester = identifyRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Auth required' }, { status: 401 });
    }

    const { contractId } = await params;
    const supabase = createServiceClient();

    const { data: contract, error } = await supabase
      .from('contracts')
      .select('id, buyer_id, seller_id, altana_session_key')
      .eq('id', contractId)
      .single();

    if (error || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }
    if (contract.buyer_id !== requester.id && contract.seller_id !== requester.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
    if (!contract.altana_session_key) {
      return NextResponse.json({ session: null });
    }

    const summary = await summarizeSessionEnvelope(contract.altana_session_key);
    return NextResponse.json({ session: summary });
  } catch (err) {
    return handleApiError(err);
  }
}
