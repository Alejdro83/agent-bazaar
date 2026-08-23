import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { generateEmbedding, toVectorLiteral } from '@/lib/embeddings';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * POST /api/concierge — natural-language agent search ("the Concierge").
 *
 * Embeds the caller's message (Cloudflare Workers AI) and runs a cosine
 * similarity search over search_embeddings via the search_agents() RPC.
 * Falls back to the plain-text search (.textSearch, Fase 2b) if the
 * similarity search comes back empty/low-confidence or Cloudflare is
 * unavailable — same graceful-degradation contract the rest of search
 * already has, never a hard failure just because the embeddings path is down.
 */

const SIMILARITY_THRESHOLD = 0.3;

interface ConciergeMatch {
  id: string;
  name: string;
  description: string;
  category: string;
  pricing_type: string;
  pricing_value: number;
  pricing_currency: string;
  total_hires: number;
  avg_rating: number;
  source: string;
  match_reason: 'semantic' | 'keyword';
  similarity: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = checkRateLimit(`concierge:${ip}`, RATE_LIMITS.search);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many requests, try again shortly' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      );
    }

    const body = await request.json().catch(() => null);
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }
    if (message.length > 500) {
      return NextResponse.json({ error: 'Message too long (max 500 chars)' }, { status: 400 });
    }

    const supabase = createServiceClient();
    let matches: ConciergeMatch[] = [];
    let usedFallback = false;

    try {
      const embedding = await generateEmbedding(message);
      const { data, error } = await supabase.rpc('search_agents', {
        query_embedding: toVectorLiteral(embedding),
        match_threshold: SIMILARITY_THRESHOLD,
        match_count: 3,
        category_filter: null,
      });
      if (error) throw error;

      matches = (data || []).map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        category: a.category,
        pricing_type: a.pricing_type,
        pricing_value: a.pricing_value,
        pricing_currency: a.pricing_currency,
        total_hires: a.total_hires,
        avg_rating: a.avg_rating,
        source: a.source,
        match_reason: 'semantic',
        similarity: a.similarity,
      }));
    } catch (embeddingError) {
      console.error('Concierge embedding/RPC error, falling back to keyword search:', embeddingError);
    }

    if (matches.length === 0) {
      usedFallback = true;
      const { data: fallbackAgents } = await supabase
        .from('agents')
        .select('id, name, description, category, pricing_type, pricing_value, pricing_currency, total_hires, avg_rating, source')
        .eq('status', 'active')
        .textSearch('search_vector', message, { type: 'websearch' })
        .order('total_hires', { ascending: false })
        .limit(3);

      matches = (fallbackAgents || []).map((a) => ({
        ...a,
        match_reason: 'keyword' as const,
        similarity: null,
      }));
    }

    return NextResponse.json({ matches, fallback: usedFallback });
  } catch (error) {
    console.error('Concierge API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
