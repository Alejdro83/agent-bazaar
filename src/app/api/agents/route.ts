import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { identifyRequester } from '@/lib/auth/identify';
import type { AgentCategory, PricingType } from '@/types/database';

/**
 * GET /api/agents — List agents with filters
 * POST /api/agents — Create new agent (requires Telegram auth)
 */

const VALID_CATEGORIES: AgentCategory[] = [
  'rebalancing',
  'grid_trading',
  'yield_optimisation',
  'health_factor',
];
const VALID_PRICING_TYPES: PricingType[] = ['free', 'fixed', 'percentage'];
// Allowlisted sort columns — never pass a user-supplied string straight to
// .order(), which would accept arbitrary column/relation syntax.
const SORT_COLUMNS = ['total_hires', 'avg_rating', 'created_at', 'pricing_value'] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { searchParams } = request.nextUrl;

    // Filters
    const categoryParam = searchParams.get('category');
    const category = VALID_CATEGORIES.includes(categoryParam as AgentCategory)
      ? (categoryParam as AgentCategory)
      : null;
    const search = searchParams.get('search');
    const pricingTypeParam = searchParams.get('pricing_type');
    const pricingType = VALID_PRICING_TYPES.includes(pricingTypeParam as PricingType)
      ? (pricingTypeParam as PricingType)
      : null;
    const sortParam = searchParams.get('sort');
    const sort: SortColumn = (SORT_COLUMNS as readonly string[]).includes(sortParam ?? '')
      ? (sortParam as SortColumn)
      : 'total_hires';
    const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    let query = supabase
      .from('agents')
      .select(
        'id, name, description, category, subcategory, pricing_type, pricing_value, pricing_currency, status, avatar_url, total_hires, avg_rating, source, chain_id, is_testnet, onchain_reputation, created_at',
        { count: 'exact' }
      );

    if (searchParams.get('seller') === 'me') {
      // Dashboard "my agents" view — needs real identity, and shows every
      // status (drafts included), not just the public 'active' listing.
      const requester = identifyRequester(request);
      if (!requester) {
        return NextResponse.json({ error: 'Auth required' }, { status: 401 });
      }
      query = query.eq('seller_id', requester.id);
    } else {
      // Public listing: status is never user-controlled.
      query = query.eq('status', 'active');
    }

    // Apply filters
    if (category) {
      query = query.eq('category', category);
    }
    if (pricingType) {
      query = query.eq('pricing_type', pricingType);
    }
    if (search) {
      // Input travels as a tsquery *value*, not interpolated filter syntax.
      query = query.textSearch('search_vector', search, { type: 'websearch' });
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
    const supabase = createServiceClient();

    const requester = identifyRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Auth required' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Validate required fields before doing any work with them. `pricing_value`
    // uses an explicit undefined/null check (not `!body[field]`) so a free
    // agent with pricing_value: 0 isn't rejected as "missing".
    const required = ['name', 'description', 'category', 'pricing_type', 'wallet_address'];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }
    if (body.pricing_value === undefined || body.pricing_value === null) {
      return NextResponse.json(
        { error: 'Missing required field: pricing_value' },
        { status: 400 }
      );
    }

    // Generate ERC-8004 identity
    const { generateERC8004Metadata } = await import("@/lib/erc8004");
    const erc8004 = generateERC8004Metadata(body.wallet_address, body.name, body.capabilities || [body.category]);

    // Insert agent
    const { data: agent, error } = await supabase
      .from('agents')
      .insert({
        seller_id: requester.id,
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
