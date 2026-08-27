import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, NotFoundError } from '@/lib/errors';
import { verifyPayment } from './verify-payment';
import { computeAgentSignal } from '@/lib/market/signals';
import { getMerchant } from '@/lib/x402/merchant';
import { signX402Payment } from '@/lib/x402/buyer';
import type { Json } from '@/types/database';
import type { Requester } from '@/lib/auth/identify';

/**
 * Shared "hire an agent" logic — the actual deliverable behind both the web
 * app's Hire button (`POST /api/contracts`) and the `hire_agent` MCP tool.
 * Runs the agent's real analysis and attaches the output to the contract —
 * this is what a buyer, or an AI agent hiring through MCP, gets back. See
 * src/lib/market/signals.ts.
 */
export async function hireAgent(
  supabase: SupabaseClient,
  requester: Requester,
  params: { agentId: string; paymentTxHash?: string | null }
) {
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, seller_id, wallet_address, pricing_type, pricing_value, pricing_currency, source, erc8004_id, category, metadata')
    .eq('id', params.agentId)
    .eq('status', 'active')
    .single();

  if (agentError || !agent) {
    throw new NotFoundError('Agent');
  }

  // Agents indexed from 8004scan are real third-party identities we don't
  // control the execution/payment endpoint for — browse-only.
  if (agent.source !== 'user') {
    throw new ApiError('This agent is not hireable through Agent Bazaar — view it on 8004scan instead.', 400);
  }

  // Real payment: wallet-identified buyer + paid agent must present an
  // already-broadcast tx to the seller's wallet, verified onchain before
  // the contract exists.
  const requiresPayment = requester.source === 'wallet' && agent.pricing_type !== 'free';
  let verifiedPaymentTxHash: string | null = null;
  if (requiresPayment) {
    if (!params.paymentTxHash) {
      throw new ApiError('This agent requires payment — no transaction hash provided', 402);
    }
    const verification = await verifyPayment(params.paymentTxHash, agent.wallet_address);
    if (!verification.ok) {
      throw new ApiError(verification.error || 'Payment verification failed', 402);
    }
    verifiedPaymentTxHash = params.paymentTxHash;
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
    throw new ApiError('Failed to create contract', 500);
  }

  await supabase.rpc('update_agent_stats', { p_agent_id: agent.id });

  // The actual deliverable: run the agent's real analysis against its own
  // strategy config, and attach the output to the contract. Best-effort —
  // an upstream data-source hiccup shouldn't fail a hire that already
  // succeeded and, for paid agents, already collected payment.
  let output: Json | null = null;
  if (agent.metadata) {
    try {
      const signal = await computeAgentSignal({ category: agent.category, metadata: agent.metadata });
      output = JSON.parse(JSON.stringify(signal)) as Json;
      await supabase.from('contracts').update({ metadata: { output } }).eq('id', contract.id);
    } catch (runError) {
      console.error('Agent run error (non-blocking):', runError);
    }
  }

  // Record the hire as a real onchain write (gas-free, operator-signed) on
  // the agent's ERC-8004 registration, when there's no real buyer payment
  // to point to already — a verified buyer payment is strictly more
  // meaningful than this stand-in, so don't overwrite it.
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
      await supabase.from('contracts').update({ payment_tx_hash: paymentTxHash }).eq('id', contract.id);
    } catch (onchainError) {
      console.error('Onchain hire-record error (non-blocking):', onchainError);
    }
  }

  return {
    contract: { ...contract, payment_tx_hash: paymentTxHash, metadata: output ? { output } : contract.metadata },
    payment: paymentTxHash
      ? {
          tx_hash: paymentTxHash,
          network: 'BSC Testnet',
          status: 'confirmed' as const,
          kind: verifiedPaymentTxHash ? ('buyer_payment' as const) : ('onchain_record' as const),
        }
      : { tx_hash: null, network: 'BSC Testnet', status: 'unavailable' as const },
  };
}

/**
 * The x402/B402 sibling of hireAgent() — kept separate rather than folded
 * into a payment-method branch there, so the existing (working, verified)
 * native-BNB hire path stays untouched. Only for agents flagged
 * `metadata.payment_rail === 'x402'` (currently just "X402PayBot" — see
 * scripts/create-x402-paybot-agent.ts). Real settlement, not a mock: the
 * merchant issues a 402, our own demo wallet signs and pays it (see
 * src/lib/x402/merchant.ts's docstring for why this demo signs with a
 * wallet we control rather than the visitor's own), and the resulting
 * on-chain tx is what's stored as this contract's payment_tx_hash —
 * exactly as verifiable on BscScan as a real buyer-signed BNB transfer.
 */
export async function hireAgentViaX402(supabase: SupabaseClient, requester: Requester, params: { agentId: string }) {
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, seller_id, pricing_type, pricing_value, pricing_currency, source, metadata')
    .eq('id', params.agentId)
    .eq('status', 'active')
    .single();

  if (agentError || !agent) {
    throw new NotFoundError('Agent');
  }
  const metadata = (agent.metadata ?? {}) as Record<string, unknown>;
  if (metadata.payment_rail !== 'x402') {
    throw new ApiError('This agent is not payable via x402', 400);
  }

  const merchant = getMerchant();
  const challenge = merchant.challengeBody() as { accepts: Parameters<typeof signX402Payment>[0][] };
  const paymentHeader = await signX402Payment(challenge.accepts[0]);
  const result = await merchant.requirePayment(paymentHeader);
  if (result.status !== 200) {
    throw new ApiError(`x402 settlement failed: ${JSON.stringify(result.body)}`, 402);
  }
  const receipt = result.receipt;

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
      payment_tx_hash: receipt.txHash,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (contractError) {
    throw new ApiError('Failed to create contract', 500);
  }

  await supabase.rpc('update_agent_stats', { p_agent_id: agent.id });

  const output = {
    kind: 'x402_settlement',
    settlement: {
      transaction: receipt.txHash,
      payer: receipt.payer,
      amount: receipt.amount.toString(),
      token: receipt.token,
      rail: receipt.rail,
      network: 'eip155:97',
    },
  };
  await supabase.from('contracts').update({ metadata: { output } }).eq('id', contract.id);

  return {
    contract: { ...contract, payment_tx_hash: receipt.txHash, metadata: { output } },
    payment: {
      tx_hash: receipt.txHash,
      network: 'BSC Testnet',
      status: 'confirmed' as const,
      kind: 'x402_payment' as const,
    },
  };
}
