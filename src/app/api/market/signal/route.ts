import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { checkRateLimit, RATE_LIMITS, getRateLimitKey } from '@/lib/rate-limit';
import { getAgentSignal } from '@/lib/market/get-signal';
import { ApiError, handleApiError } from '@/lib/errors';

/**
 * GET /api/market/signal?agent_id=... — Live, per-agent market signal
 * (real Venus/Binance/DefiLlama data combined with the agent's own strategy
 * config in `metadata`). Backs the "Live signal" card on the agent detail
 * page and the one-line preview on agent cards — see src/lib/market/signals.ts.
 *
 * Thin wrapper over getAgentSignal() (src/lib/market/get-signal.ts), shared
 * with the `get_market_signal` MCP tool.
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(getRateLimitKey(request, 'market-signal'), RATE_LIMITS.search);
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const agentId = request.nextUrl.searchParams.get('agent_id');
    if (!agentId) {
      return NextResponse.json({ error: 'Missing agent_id' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const signal = await getAgentSignal(supabase, agentId);
    return NextResponse.json({ signal });
  } catch (error) {
    // Not-found is a clean 404; anything else (a live-data fetch/compute
    // failure) keeps the specific 502 + real error message this route has
    // always returned, which is more useful for a flaky upstream API than
    // a generic "Internal server error" would be.
    if (error instanceof ApiError) return handleApiError(error);
    console.error('Market signal error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to compute signal' },
      { status: 502 }
    );
  }
}
