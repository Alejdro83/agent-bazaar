import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { identifyRequester } from '@/lib/auth/identify';
import { hireAgentViaX402 } from '@/lib/contracts/hire';
import { handleApiError } from '@/lib/errors';

/**
 * POST /api/contracts/x402 — hire an x402-payable agent (currently just
 * "X402PayBot") via a real, self-hosted x402/B402 settlement instead of a
 * buyer-signed native BNB transfer. See src/lib/contracts/hire.ts's
 * hireAgentViaX402() for the real settlement + contract-creation logic,
 * and src/lib/x402/merchant.ts for why this is self-hosted (no
 * third-party facilitator dependency).
 *
 * Body: { agentId: string }. Same identification (wallet or Telegram) as
 * the regular POST /api/contracts — this is a different payment rail, not
 * a different authentication bar.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const requester = identifyRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Auth required' }, { status: 401 });
    }

    const body = await request.json();
    if (!body?.agentId) {
      return NextResponse.json({ error: 'agentId required' }, { status: 400 });
    }

    const result = await hireAgentViaX402(supabase, requester, { agentId: body.agentId });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
