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
        'id, name, description, category, subcategory, pricing_type, pricing_value, pricing_currency, status, avatar_url, total_hires, avg_rating, total_revenue, source, chain_id, is_testnet, onchain_reputation, erc8004_data, metadata, created_at',
        { count: 'exact' }
      );

    const isSellerView = searchParams.get('seller') === 'me';
    if (isSellerView) {
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

    // Sort and paginate. The vast majority of agents tie on total_hires=0,
    // and Postgres doesn't guarantee stable ordering across separate
    // LIMIT/OFFSET calls for tied rows without a deterministic tiebreaker —
    // without `id` here, pages could repeat or skip agents between requests.
    // `id` is a random UUID (not insertion order), but any fixed column
    // works as a tiebreaker; it only needs to be consistent, not meaningful.
    query = query
      .order(sort, { ascending: order === 'asc' })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    const { data: agents, error, count } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch agents' },
        { status: 500 }
      );
    }

    // Cheap, honest "Data Quality" signal for the public listing: when the
    // real BSC catalog (source='8004scan') was last synced, not just a
    // static count.
    let lastSyncedAt: string | null = null;
    if (!isSellerView) {
      const { data: latest } = await supabase
        .from('agents')
        .select('created_at')
        .eq('source', '8004scan')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      lastSyncedAt = latest?.created_at ?? null;
    }

    return NextResponse.json({
      agents: agents || [],
      total: count || 0,
      limit,
      offset,
      last_synced_at: lastSyncedAt,
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

    // Insert the listing first (draft) — the DB id becomes the agent's own
    // ERC-8004 "web" endpoint (/agent/<id>), so registration needs the row
    // to already exist.
    const { data: draftAgent, error: draftError } = await supabase
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
        status: 'draft',
        metadata: body.metadata || null,
      })
      .select()
      .single();

    if (draftError || !draftAgent) {
      console.error('Supabase insert error:', draftError);
      return NextResponse.json(
        { error: 'Failed to create agent' },
        { status: 500 }
      );
    }

    // Register on the ERC-8004 Identity Registry (BSC testnet, gas-free via
    // MegaFuel). A failure here leaves the listing as 'draft' rather than
    // half-published as 'active' with no real onchain identity.
    const pricingLabel =
      body.pricing_type === 'free' ? 'Free' :
      body.pricing_type === 'percentage' ? `${body.pricing_value}% of yield` :
      `$${body.pricing_value}/mo`;

    try {
      const { registerAgentOnchain, toJson } = await import('@/lib/erc8004');
      const registration = await registerAgentOnchain({
        agentDbId: draftAgent.id,
        name: body.name,
        description: body.description,
        category: body.category,
        sellerWallet: body.wallet_address,
        pricingLabel,
      });

      const { data: agent, error: updateError } = await supabase
        .from('agents')
        .update({
          status: 'active',
          erc8004_id: registration.agentId !== null ? String(registration.agentId) : null,
          erc8004_data: toJson(registration),
          onchain_tx_hash: registration.transactionHash,
        })
        .eq('id', draftAgent.id)
        .select()
        .single();

      if (updateError || !agent) {
        console.error('Supabase update error after onchain registration:', updateError);
        return NextResponse.json(
          { error: 'Agent registered onchain but failed to save — contact support', agent: draftAgent },
          { status: 500 }
        );
      }

      // Best-effort: index for the Concierge (semantic search). A failure
      // here just means this agent falls back to keyword search until the
      // next backfill run — not worth failing the whole listing over.
      try {
        const { generateEmbedding, buildAgentSearchText, toVectorLiteral } = await import('@/lib/embeddings');
        const text = buildAgentSearchText(agent);
        const embedding = await generateEmbedding(text);
        await supabase
          .from('search_embeddings')
          .upsert({ agent_id: agent.id, content: text, embedding: toVectorLiteral(embedding) }, { onConflict: 'agent_id' });
      } catch (embeddingError) {
        console.error('Embedding indexing error (non-blocking):', embeddingError);
      }

      return NextResponse.json({ agent }, { status: 201 });
    } catch (registrationError) {
      console.error('ERC-8004 registration error:', registrationError);
      return NextResponse.json(
        {
          error: 'Onchain registration failed — your listing was saved as a draft, try again shortly.',
          agent: draftAgent,
        },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
