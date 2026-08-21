import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/**
 * POST /api/contracts — Create a new contract (hire an agent)
 * Mock x402 payment flow for hackathon demo
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();

    // Validate Telegram auth
    const initData = request.headers.get('x-telegram-init-data');
    if (!initData) {
      return NextResponse.json({ error: 'Auth required' }, { status: 401 });
    }

    const { validateInitData } = await import('@/lib/telegram/validate');
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const authResult = validateInitData(initData, botToken);
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: 'Invalid auth' }, { status: 401 });
    }

    const body = await request.json();
    const { agent_id, pricing_type, pricing_value, pricing_currency } = body;

    if (!agent_id) {
      return NextResponse.json({ error: 'Missing agent_id' }, { status: 400 });
    }

    // Fetch agent to get seller_id and wallet
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, seller_id, wallet_address, pricing_type, pricing_value, pricing_currency')
      .eq('id', agent_id)
      .eq('status', 'active')
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Mock x402 payment — in production this would:
    // 1. Generate x402 payment request (ERC-8183)
    // 2. Buyer's Altana wallet signs and pays
    // 3. Payment tx hash recorded
    // For demo: simulate successful payment
    const mockTxHash = `0x${Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('')}`;

    // Create contract
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .insert({
        agent_id: agent.id,
        buyer_id: String(authResult.user.id),
        seller_id: agent.seller_id,
        status: 'active',
        pricing_type: agent.pricing_type,
        pricing_value: agent.pricing_value,
        pricing_currency: agent.pricing_currency,
        payment_tx_hash: mockTxHash,
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

    return NextResponse.json({
      contract,
      payment: {
        tx_hash: mockTxHash,
        network: 'BSC Testnet',
        status: 'confirmed',
        note: 'Mock payment for demo',
      },
    }, { status: 201 });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
