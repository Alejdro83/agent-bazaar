import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { checkRateLimit, RATE_LIMITS, getRateLimitKey } from '@/lib/rate-limit';
import { computeAgentSignal } from '@/lib/market/signals';

/**
 * GET /api/market/signal?agent_id=... — Live, per-agent market signal
 * (real Venus/Binance/DefiLlama data combined with the agent's own strategy
 * config in `metadata`). Backs the "Live signal" card on the agent detail
 * page and the one-line preview on agent cards — see src/lib/market/signals.ts.
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
    const { data: agent, error } = await supabase
      .from('agents')
      .select('id, category, metadata, status')
      .eq('id', agentId)
      .eq('status', 'active')
      .single();

    if (error || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const signal = await computeAgentSignal(agent);
    return NextResponse.json({ signal });
  } catch (error) {
    console.error('Market signal error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to compute signal' },
      { status: 502 }
    );
  }
}
