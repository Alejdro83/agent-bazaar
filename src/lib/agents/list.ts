import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentCategory, PricingType } from '@/types/database';
import { ApiError } from '@/lib/errors';

/**
 * Shared "list agents" logic — used by both `GET /api/agents` (the web app)
 * and the `list_agents` MCP tool (`src/app/api/mcp/route.ts`), so an AI
 * agent discovering the marketplace sees exactly the same catalog a human
 * browsing does, not a second implementation that can drift from it.
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

export interface ListAgentsParams {
  category?: string | null;
  search?: string | null;
  pricingType?: string | null;
  sort?: string | null;
  order?: string | null;
  limit?: number;
  offset?: number;
  /** Already-authenticated seller id. When set, returns every status this
   *  seller owns instead of the public 'active' listing — callers decide
   *  whether the requester is allowed to ask for this, this function just
   *  applies the filter. */
  sellerId?: string | null;
}

export async function listAgents(supabase: SupabaseClient, params: ListAgentsParams) {
  const category = VALID_CATEGORIES.includes(params.category as AgentCategory)
    ? (params.category as AgentCategory)
    : null;
  const pricingType = VALID_PRICING_TYPES.includes(params.pricingType as PricingType)
    ? (params.pricingType as PricingType)
    : null;
  const sort: SortColumn = (SORT_COLUMNS as readonly string[]).includes(params.sort ?? '')
    ? (params.sort as SortColumn)
    : 'total_hires';
  const order = params.order === 'asc' ? 'asc' : 'desc';
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);

  let query = supabase
    .from('agents')
    .select(
      'id, name, description, category, subcategory, pricing_type, pricing_value, pricing_currency, status, avatar_url, total_hires, avg_rating, total_revenue, source, chain_id, is_testnet, onchain_reputation, erc8004_data, metadata, created_at',
      { count: 'exact' }
    );

  const isSellerView = !!params.sellerId;
  if (isSellerView) {
    query = query.eq('seller_id', params.sellerId!);
  } else {
    query = query.eq('status', 'active');
  }
  if (category) query = query.eq('category', category);
  if (pricingType) query = query.eq('pricing_type', pricingType);
  if (params.search) {
    // Input travels as a tsquery *value*, not interpolated filter syntax.
    query = query.textSearch('search_vector', params.search, { type: 'websearch' });
  }

  // The vast majority of agents tie on total_hires=0, and Postgres doesn't
  // guarantee stable ordering across separate LIMIT/OFFSET calls for tied
  // rows without a deterministic tiebreaker — `id` fixes that (see
  // git history for the pagination bug this closed).
  query = query
    .order(sort, { ascending: order === 'asc' })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);

  const { data: agents, error, count } = await query;
  if (error) {
    console.error('Supabase error (listAgents):', error);
    throw new ApiError('Failed to fetch agents', 500);
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

  return {
    agents: agents || [],
    total: count || 0,
    limit,
    offset,
    last_synced_at: lastSyncedAt,
  };
}
