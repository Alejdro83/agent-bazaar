import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/**
 * GET /api/agents — List agents with filters
 * POST /api/agents — Create new agent (requires Telegram auth)
 */

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = request.nextUrl;

    // Filters
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const pricingType = searchParams.get('pricing_type');
    const status = searchParams.get('status') || 'active';
    const sort = searchParams.get('sort') || 'total_hires';
    const order = searchParams.get('order') || 'desc';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build query
    let query = supabase
      .from('agents')
      .select('*', { count: 'exact' })
      .eq('status', status);

    // Apply filters
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    if (pricingType) {
      query = query.eq('pricing_type', pricingType);
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Sort and paginate
    query = query
      .order(sort, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1);

    const { data: agents, error, count } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch agents' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      agents: agents || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();

    // Validate Telegram auth
    const initData = request.headers.get('x-telegram-init-data');
    if (!initData) {
      return NextResponse.json({ error: 'Auth required' }, { status: 401 });
    }

    // Validate initData server-side
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

    // Generate ERC-8004 identity
    const { generateERC8004Metadata } = await import("@/lib/erc8004");
    const walletAddress = body.wallet_address || "0x" + "0".repeat(40);
    const erc8004 = generateERC8004Metadata(walletAddress, body.name, body.capabilities || [body.category]);

    // Validate required fields
    const required = ['name', 'description', 'category', 'pricing_type', 'pricing_value', 'wallet_address'];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Insert agent
    const { data: agent, error } = await supabase
      .from('agents')
      .insert({
        seller_id: String(authResult.user.id),
        name: body.name,
        description: body.description,
        category: body.category,
        subcategory: body.subcategory || null,
        pricing_type: body.pricing_type,
        pricing_value: body.pricing_value,
        pricing_currency: body.pricing_currency || 'USD',
        wallet_address: body.wallet_address,
        status: "active",
        erc8004_id: erc8004.erc8004_id,
        erc8004_data: erc8004.erc8004_data,
        metadata: body.metadata || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json(
        { error: 'Failed to create agent' },
        { status: 500 }
      );
    }

    return NextResponse.json({ agent }, { status: 201 });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
