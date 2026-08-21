import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

// GET /api/agents — List agents with optional filters
export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);

  const category = searchParams.get('category');
  const status = searchParams.get('status') || 'active';
  const sort = searchParams.get('sort') || 'created_at';
  const order = searchParams.get('order') || 'desc';
  const limit = parseInt(searchParams.get('limit') || '20');
  const offset = parseInt(searchParams.get('offset') || '0');
  const search = searchParams.get('search');

  let query = supabase
    .from('agents')
    .select('*', { count: 'exact' })
    .eq('status', status)
    .order(sort, { ascending: order === 'asc' })
    .range(offset, offset + limit - 1);

  if (category) {
    query = query.eq('category', category);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    agents: data,
    total: count,
    limit,
    offset,
  });
}

// POST /api/agents — Create a new agent
export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  const body = await request.json();

  const { data, error } = await supabase
    .from('agents')
    .insert({
      seller_id: body.seller_id,
      name: body.name,
      description: body.description,
      category: body.category,
      subcategory: body.subcategory,
      pricing_type: body.pricing_type || 'free',
      pricing_value: body.pricing_value || 0,
      pricing_currency: body.pricing_currency || 'USD',
      wallet_address: body.wallet_address,
      status: body.status || 'draft',
      metadata: body.metadata,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ agent: data }, { status: 201 });
}