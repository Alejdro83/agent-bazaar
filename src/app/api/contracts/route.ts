import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { identifyRequester } from '@/lib/auth/identify';

/**
 * GET /api/contracts?role=buyer|seller — List the caller's contracts (dashboard)
 * POST /api/contracts — Create a new contract (hire an agent)
 * Mock x402 payment flow for hackathon demo
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

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { agent_id } = body;

    if (!agent_id) {
      return NextResponse.json({ error: 'Missing agent_id' }, { status: 400 });
    }

    // Fetch agent to get seller_id and wallet
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, seller_id, wallet_address, pricing_type, pricing_value, pricing_currency, source, erc8004_id')
      .eq('id', agent_id)
      .eq('status', 'active')
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Agents indexed from 8004scan are real third-party identities we don't
    // control the execution/payment endpoint for — browse-only, not hireable
    // through our (mock) contract flow. See useIdentity.ts / plan Fase 1.
    if (agent.source !== 'user') {
      return NextResponse.json(
        { error: 'This agent is not hireable through Agent Bazaar — view it on 8004scan instead.' },
        { status: 400 }
      );
    }

    // Create contract (no payment_tx_hash yet — see the onchain write below).
    // Full x402/ERC-8183 escrow payment is out of scope (it would require the
    // buyer to hold and approve a payment token, adding real friction to
    // "hire with one click" — see src/lib/erc8004/recordHireOnchain).
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .insert({
        agent_id: agent.id,
        buyer_id: requester.id,
        seller_id: agent.seller_id,
        status: 'active',
        pricing_type: agent.pricing_type,
        pricing_value: agent.pricing_value,
        pricing_currency: agent.pricing_currency,
        started_at: new Date().toISOString(),
        expires_at: agent.pricing_type === 'fixed'
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
          : null,
      })
      .select()
      .single();

    if (contractError) {
      console.error('Contract creation error:', contractError);
      return NextResponse.json(
        { error: 'Failed to create contract' },
        { status: 500 }
      );
    }

    // Update agent stats
    await supabase.rpc('update_agent_stats', { p_agent_id: agent.id });

    // Record the hire as a real onchain write (gas-free, operator-signed) on
    // the agent's ERC-8004 registration — a genuine, BscScan-verifiable tx.
    // Best-effort: only agents actually registered onchain (Fase 4) carry an
    // erc8004_id, and a transient RPC failure shouldn't block the hire the
    // buyer already paid nothing extra for.
    let paymentTxHash: string | null = null;
    if (agent.erc8004_id) {
      try {
        const { recordHireOnchain } = await import('@/lib/erc8004');
        const record = await recordHireOnchain({
          erc8004AgentId: Number(agent.erc8004_id),
          contractId: contract.id,
          buyerId: requester.id,
        });
        paymentTxHash = record.transactionHash;
        await supabase
          .from('contracts')
          .update({ payment_tx_hash: paymentTxHash })
          .eq('id', contract.id);
      } catch (onchainError) {
        console.error('Onchain hire-record error (non-blocking):', onchainError);
      }
    }

    return NextResponse.json({
      contract: { ...contract, payment_tx_hash: paymentTxHash },
      payment: paymentTxHash
        ? { tx_hash: paymentTxHash, network: 'BSC Testnet', status: 'confirmed' }
        : { tx_hash: null, network: 'BSC Testnet', status: 'unavailable' },
    }, { status: 201 });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
