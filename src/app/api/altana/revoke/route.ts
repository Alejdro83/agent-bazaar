import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { identifyRequester } from '@/lib/auth/identify';
import { revokeGrantedSession } from '@/lib/altana';
import { parseSessionEnvelope, serializeEnvelope } from '@/lib/altana/session-envelope';
import { handleApiError } from '@/lib/errors';

/**
 * POST /api/altana/revoke — Revoke a contract's Altana session. Body:
 * `{ contract_id }`. Buyer or seller only — same authorization bar as
 * `getContractDetail()` (src/lib/contracts/get.ts), reimplemented narrowly
 * here (rather than reusing that shared helper) because this route needs
 * to read/write `altana_session_key`, a column that helper deliberately
 * does not select (see GET /api/altana/session/[contractId] for why: it
 * carries session key material that must never round-trip through a
 * generic "read a contract" response).
 *
 * User-facing control per the Altana track's requirement: "a user can see
 * what their agent may do, and revoke it, inside the product." Revocation
 * is real and immediate at the on-chain validator (gas only, no fee) —
 * this route just also records it unambiguously in our own envelope (see
 * src/lib/altana/session-envelope.ts) so the UI never has to re-derive
 * revoked status by guessing.
 */
export async function POST(request: NextRequest) {
  try {
    const requester = identifyRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Auth required' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const contractId = body?.contract_id;
    if (!contractId || typeof contractId !== 'string') {
      return NextResponse.json({ error: 'Missing contract_id' }, { status: 400 });
    }

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
      return NextResponse.json({ error: 'This contract has no Altana session to revoke' }, { status: 400 });
    }

    const envelope = parseSessionEnvelope(contract.altana_session_key);
    if (envelope.revoked) {
      return NextResponse.json(
        { error: 'Session already revoked', revoked_at: envelope.revokedAt },
        { status: 409 }
      );
    }

    let revokeResult;
    try {
      revokeResult = await revokeGrantedSession(envelope.serialized);
    } catch (revokeError) {
      const message = revokeError instanceof Error ? revokeError.message : String(revokeError);
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const updatedEnvelope = {
      ...envelope,
      revoked: true,
      revokedAt: new Date().toISOString(),
      revokeTxHash: revokeResult.transactionHash ?? null,
    };

    const { error: updateError } = await supabase
      .from('contracts')
      .update({ altana_session_key: serializeEnvelope(updatedEnvelope) })
      .eq('id', contractId);

    if (updateError) {
      console.error('Failed to persist Altana session revocation:', updateError);
      return NextResponse.json({ error: 'Revoked onchain but failed to save — contact support' }, { status: 500 });
    }

    return NextResponse.json({
      contract_id: contractId,
      revoked: true,
      revoked_at: updatedEnvelope.revokedAt,
      revoke_tx_hash: updatedEnvelope.revokeTxHash,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
