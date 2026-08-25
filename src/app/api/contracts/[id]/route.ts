import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { identifyRequester } from '@/lib/auth/identify';
import { getContractDetail } from '@/lib/contracts/get';
import { handleApiError } from '@/lib/errors';

/**
 * GET /api/contracts/[id] — Read back one contract, including the agent's
 * real analysis output (contracts.metadata.output — see POST /api/contracts).
 * This is the "Agent output" screen a buyer lands on right after hiring.
 * Buyer or seller only — a contract carries wallet/Telegram identities that
 * shouldn't leak to an arbitrary caller who guesses a UUID.
 *
 * Thin wrapper over getContractDetail() (src/lib/contracts/get.ts), shared
 * with the `get_hire_result` MCP tool.
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
    const result = await getContractDetail(supabase, id, requester.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
