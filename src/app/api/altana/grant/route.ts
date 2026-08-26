import { NextRequest, NextResponse } from 'next/server';
import { formatEther } from 'viem';
import { createServiceClient } from '@/lib/supabase/service';
import { identifyRequester } from '@/lib/auth/identify';
import { checkRateLimit, RATE_LIMITS, getRateLimitKey } from '@/lib/rate-limit';
import { hireAgent } from '@/lib/contracts/hire';
import { grantSwapSession } from '@/lib/altana';
import { wrapSessionEnvelope, serializeEnvelope } from '@/lib/altana/session-envelope';
import { handleApiError } from '@/lib/errors';

// A distinguishing runtime config, not a functional requirement — Vercel's
// Next.js builder was symlinking this route's serverless function to an
// unrelated route's identical-looking bundle (agents/[id]/route), which
// dropped @altananetwork/sdk's files even though this route's own Next.js
// trace (.nft.json) correctly includes them (see next.config.js's
// outputFileTracingIncludes). A distinct maxDuration is enough to stop
// Vercel from treating the two as shareable.
export const maxDuration = 30;

/**
 * POST /api/altana/grant — Hire an Altana-session-capable agent (currently
 * just "AltanaGridBot" — see scripts/create-altana-gridbot-agent.ts) AND
 * grant a real, KeyStore-registered Altana session in the same call, tied
 * to the resulting contract via `contracts.altana_session_key`.
 *
 * Body: `{ agent_id }`. Deliberately does NOT trust the client's agent_id
 * alone — only agents explicitly marked `metadata.altana_session_agent ===
 * true` can be granted a session through this route.
 *
 * The hire itself reuses `hireAgent()` (src/lib/contracts/hire.ts) as-is —
 * same free-agent path the normal Hire button uses, so a real `contracts`
 * row (and, best-effort, a real onchain hire record) exists before we
 * attempt the session grant. If the session grant then fails — almost
 * certainly because the dedicated demo wallet isn't funded yet, see
 * altana-report/NEXT_STEPS.md — the contract still exists (the hire
 * succeeded) but `altana_session_key` stays null; we return a specific 502
 * with the real underlying error plus the contract id, not a generic 500.
 */
export async function POST(request: NextRequest) {
  try {
    const requester = identifyRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Auth required' }, { status: 401 });
    }

    const rateLimit = checkRateLimit(getRateLimitKey(request, 'altana-grant'), RATE_LIMITS.hire);
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests, try again later' }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const agentId = body?.agent_id;
    if (!agentId || typeof agentId !== 'string') {
      return NextResponse.json({ error: 'Missing agent_id' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, metadata, status')
      .eq('id', agentId)
      .eq('status', 'active')
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const metadata = (agent.metadata ?? {}) as Record<string, unknown>;
    if (metadata.altana_session_agent !== true) {
      return NextResponse.json(
        { error: 'This agent is not configured for Altana session grants.' },
        { status: 400 }
      );
    }

    // Real hire — creates the contract row this session gets tied to. Free
    // agent, so no payment tx is needed regardless of requester type.
    const { contract } = await hireAgent(supabase, requester, { agentId });

    let granted;
    try {
      // A longer TTL than the CLI demo's 15 minutes — long enough for a
      // real person to actually see the grant and press Revoke in the UI.
      granted = await grantSwapSession({ ttlSeconds: 60 * 60 });
    } catch (grantError) {
      const message = grantError instanceof Error ? grantError.message : String(grantError);
      return NextResponse.json({ error: message, contract_id: contract.id }, { status: 502 });
    }

    const envelope = wrapSessionEnvelope(granted.serializedSession);
    const { error: updateError } = await supabase
      .from('contracts')
      .update({ altana_session_key: serializeEnvelope(envelope) })
      .eq('id', contract.id);

    if (updateError) {
      console.error('Failed to persist Altana session on contract:', updateError);
      return NextResponse.json(
        { error: 'Session granted onchain but failed to save — contact support', contract_id: contract.id },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        contract_id: contract.id,
        session_public_key: granted.sessionPublicKey,
        session_wallet_address: granted.sessionAddress,
        permissions: {
          call_allowlist: granted.callAllowlist,
          native_spend_cap_wei: granted.nativeSpendCapWei,
          native_spend_cap_bnb: formatEther(BigInt(granted.nativeSpendCapWei)),
          expiry: granted.expiry,
          expiry_iso: new Date(granted.expiry * 1000).toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
