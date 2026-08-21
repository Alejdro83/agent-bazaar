import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/**
 * GET /api/agents/[id] — Get agent detail
 * PUT /api/agents/[id] — Update agent (owner only)
 * DELETE /api/agents/[id] — Soft-delete agent (owner only)
 */

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerClient();
    const { id } = params;

    const { data: agent, error } = await supabase
      .from('agents')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Fetch ratings for this agent
    const { data: ratings } = await supabase
      .from('ratings')
      .select('id, score, comment, created_at, rater_id')
      .eq('agent_id', id)
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      agent,
      ratings: ratings || [],
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { id } = params;
    const body = await request.json();

    // Verify ownership
    const { data: existing } = await supabase
      .from('agents')
      .select('seller_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (existing.seller_id !== String(authResult.user.id)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Update agent
    const { data: agent, error } = await supabase
      .from('agents')
      .update({
        name: body.name,
        description: body.description,
        category: body.category,
        subcategory: body.subcategory,
        pricing_type: body.pricing_type,
        pricing_value: body.pricing_value,
        pricing_currency: body.pricing_currency,
        wallet_address: body.wallet_address,
        metadata: body.metadata,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase update error:', error);
      return NextResponse.json(
        { error: 'Failed to update agent' },
        { status: 500 }
      );
    }

    return NextResponse.json({ agent });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { id } = params;

    // Verify ownership
    const { data: existing } = await supabase
      .from('agents')
      .select('seller_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (existing.seller_id !== String(authResult.user.id)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Soft delete (set status to 'deleted')
    const { error } = await supabase
      .from('agents')
      .update({ status: 'deleted' })
      .eq('id', id);

    if (error) {
      console.error('Supabase delete error:', error);
      return NextResponse.json(
        { error: 'Failed to delete agent' },
        { status: 500 }
      );
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
