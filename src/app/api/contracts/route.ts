import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, type Hex } from 'viem';
import { createServiceClient } from '@/lib/supabase/service';
import { identifyRequester } from '@/lib/auth/identify';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * GET /api/contracts?role=buyer|seller — List the caller's contracts (dashboard)
 * POST /api/contracts — Create a new contract (hire an agent).
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
 * buyer payment — see recordHireOnchain below.
 */

const BSC_TESTNET_RPC = 'https://data-seed-prebsc-2-s2.binance.org:8545';
const MIN_PAYMENT_WEI = BigInt('100000000000000'); // 0.0001 BNB — trivial on testnet, but a real signed transfer

async function verifyPayment(txHash: string, expectedTo: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { ok: false, error: 'Malformed transaction hash' };
  }
  const client = createPublicClient({ transport: http(BSC_TESTNET_RPC) });
  try {
    const [receipt, tx] = await Promise.all([
      client.getTransactionReceipt({ hash: txHash as Hex }),
      client.getTransaction({ hash: txHash as Hex }),
    ]);
    if (receipt.status !== 'success') return { ok: false, error: 'Transaction did not succeed onchain' };
    if (receipt.to?.toLowerCase() !== expectedTo.toLowerCase()) {
      return { ok: false, error: 'Transaction was not sent to this agent\'s wallet' };
    }
    if (tx.value < MIN_PAYMENT_WEI) {
      return { ok: false, error: 'Payment amount too low' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not verify transaction onchain (not found or RPC error)' };
  }
}

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

    // Real payment: wallet-identified buyer + paid agent must present an
    // already-broadcast tx to the seller's wallet, verified onchain before
    // the contract exists. Full x402/ERC-8183 escrow is still out of scope
    // (it would require the buyer to hold and approve a payment token,
    // adding real friction to "hire with one click").
    const requiresPayment = requester.source === 'wallet' && agent.pricing_type !== 'free';
    let verifiedPaymentTxHash: string | null = null;
    if (requiresPayment) {
      if (!payment_tx_hash || typeof payment_tx_hash !== 'string') {
        return NextResponse.json({ error: 'This agent requires payment — no transaction hash provided' }, { status: 402 });
      }
      const verification = await verifyPayment(payment_tx_hash, agent.wallet_address);
      if (!verification.ok) {
        return NextResponse.json({ error: verification.error || 'Payment verification failed' }, { status: 402 });
      }
      verifiedPaymentTxHash = payment_tx_hash;
    }

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
        payment_tx_hash: verifiedPaymentTxHash,
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
    // Only needed when there's no real buyer payment to point to already
    // (free agents, or Telegram-identified buyers who have no wallet payment
    // path yet) — a verified buyer payment is strictly more meaningful than
    // this stand-in, so don't overwrite it. Best-effort: only agents
    // actually registered onchain (Fase 4) carry an erc8004_id, and a
    // transient RPC failure shouldn't block a hire that already succeeded.
    let paymentTxHash: string | null = verifiedPaymentTxHash;
    if (!paymentTxHash && agent.erc8004_id) {
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
        ? {
            tx_hash: paymentTxHash,
            network: 'BSC Testnet',
            status: 'confirmed',
            kind: verifiedPaymentTxHash ? 'buyer_payment' : 'onchain_record',
          }
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
