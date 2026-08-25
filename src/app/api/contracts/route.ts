import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { identifyRequester } from '@/lib/auth/identify';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { hireAgent } from '@/lib/contracts/hire';
import { handleApiError } from '@/lib/errors';

/**
 * GET /api/contracts?role=buyer|seller — List the caller's contracts (dashboard)
 * POST /api/contracts — Create a new contract (hire an agent). Also runs the
 * agent's real analysis and attaches it as the contract's deliverable — see
 * src/app/api/contracts/[id]/route.ts for how a buyer reads it back.
 *
 * POST is a thin wrapper over hireAgent() (src/lib/contracts/hire.ts), shared
 * with the `hire_agent` MCP tool (src/app/api/mcp/route.ts) so both see the
 * exact same hire behavior — payment verification, contract insert, stats
 * update, signal computation, onchain record.
 *
 * Payment: a wallet-identified buyer hiring a paid agent must submit a real,
 * already-signed native BNB transfer to the seller's wallet — verified here
 * against the chain before the contract is created. The amount is a small
 * fixed testnet amount, not pricing_value converted via a price oracle
 * (which is out of scope) — this proves real value moved from a real wallet
 * the buyer controls, it does not claim to charge the exact listed USD
 * price. Telegram-identified buyers (no signing capability without a
 * connected wallet, out of scope for this pass) keep the previous
 * behavior: a real operator-signed onchain hire-record write instead of a
 * buyer payment — see recordHireOnchain in hire.ts.
 */

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const requester = identifyRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Auth required' }, { status: 401 });
    }

    const role = request.nextUrl.searchParams.get('role') === 'seller' ? 'seller' : 'buyer';
    const column = role === 'seller' ? 'seller_id' : 'buyer_id';

    const { data: contracts, error } = await supabase
      .from('contracts')
      .select('id, agent_id, buyer_id, seller_id, status, pricing_type, pricing_value, pricing_currency, payment_tx_hash, started_at, expires_at, created_at')
      .eq(column, requester.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: 'Failed to fetch contracts' }, { status: 500 });
    }

    return NextResponse.json({ contracts: contracts || [] });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();

    const requester = identifyRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Auth required' }, { status: 401 });
    }

    const rateLimit = checkRateLimit(`hire:${requester.id}`, RATE_LIMITS.hire);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many hire attempts, try again later' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { agent_id, payment_tx_hash } = body;

    if (!agent_id) {
      return NextResponse.json({ error: 'Missing agent_id' }, { status: 400 });
    }

    const result = await hireAgent(supabase, requester, {
      agentId: agent_id,
      paymentTxHash: payment_tx_hash,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
