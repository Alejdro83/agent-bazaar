import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { generateEmbedding, buildAgentSearchText } from '@/lib/embeddings';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * POST /api/arena — head-to-head comparison for a stated financial goal.
 *
 * Every number here traces to something real: the objective-fit score is a
 * genuine cosine similarity against the agent's own embedding (same pipeline
 * as the Concierge), rating/hires/onchain reputation are read straight from
 * the DB. The one heuristic — category risk profile — is computed from a
 * fixed per-category table and shown as clearly-labeled context, and is
 * deliberately excluded from the winner score so a static lookup never
 * decides who "wins". See CATEGORY_RISK_PROFILE below.
 */

// Fixed per-category risk heuristic — NOT agent-specific data. Shown to the
// user as "category risk profile", excluded from the winner calculation.
const CATEGORY_RISK_PROFILE: Record<string, { riskLevel: number; safetyScore: number }> = {
  rebalancing: { riskLevel: 2, safetyScore: 65 },
  grid_trading: { riskLevel: 3, safetyScore: 45 },
  yield_optimisation: { riskLevel: 3, safetyScore: 40 },
  health_factor: { riskLevel: 1, safetyScore: 85 },
};

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function parseVectorLiteral(literal: string): number[] {
  return literal.slice(1, -1).split(',').map(Number);
}

function affordabilityScore(pricingType: string, pricingValue: number): number {
  if (pricingType === 'free') return 100;
  if (pricingType === 'percentage') return Math.max(0, 100 - (pricingValue / 5) * 100);
  return Math.max(0, 100 - (pricingValue / 50) * 100); // $50/mo treated as the low-affordability ceiling
}

interface AgentSide {
  id: string;
  name: string;
  category: string;
  description: string;
  pricing_type: string;
  pricing_value: number;
  pricing_currency: string;
  avg_rating: number;
  total_hires: number;
  onchain_reputation: number | null;
  source: string;
  scores: {
    objective_fit: number;
    rating: number;
    track_record: number;
    category_safety: number;
    affordability: number;
  };
  winner_score: number;
}

async function embedAgentIfMissing(
  supabase: ReturnType<typeof createServiceClient>,
  agent: { id: string; name: string; description: string; category: string }
): Promise<number[]> {
  const { data: existing } = await supabase
    .from('search_embeddings')
    .select('embedding')
    .eq('agent_id', agent.id)
    .maybeSingle();
  if (existing?.embedding) return parseVectorLiteral(existing.embedding);

  // Best-effort: agent listed before the embedding pipeline existed, or the
  // backfill hasn't caught it yet. Embed on the fly rather than fail the
  // whole comparison.
  const text = buildAgentSearchText(agent);
  const embedding = await generateEmbedding(text);
  await supabase.from('search_embeddings').upsert(
    { agent_id: agent.id, content: text, embedding: `[${embedding.join(',')}]` },
    { onConflict: 'agent_id' }
  );
  return embedding;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = checkRateLimit(`arena:${ip}`, RATE_LIMITS.search);
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests, try again shortly' }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const objective = typeof body?.objective === 'string' ? body.objective.trim() : '';
    const agentAId = body?.agentA_id;
    const agentBId = body?.agentB_id;
    if (!objective || !agentAId || !agentBId) {
      return NextResponse.json({ error: 'Missing objective, agentA_id, or agentB_id' }, { status: 400 });
    }
    if (agentAId === agentBId) {
      return NextResponse.json({ error: 'Pick two different agents' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: agents, error } = await supabase
      .from('agents')
      .select('id, name, description, category, pricing_type, pricing_value, pricing_currency, avg_rating, total_hires, onchain_reputation, source, status')
      .in('id', [agentAId, agentBId]);

    if (error || !agents || agents.length !== 2) {
      return NextResponse.json({ error: 'One or both agents not found' }, { status: 404 });
    }
    const agentA = agents.find((a) => a.id === agentAId)!;
    const agentB = agents.find((a) => a.id === agentBId)!;

    const objectiveEmbedding = await generateEmbedding(objective);

    const buildSide = async (agent: typeof agentA): Promise<AgentSide> => {
      const embedding = await embedAgentIfMissing(supabase, agent);
      const similarity = cosineSimilarity(objectiveEmbedding, embedding);
      const objectiveFit = Math.round(Math.max(0, Math.min(1, similarity)) * 100);
      const rating = Math.round((agent.avg_rating / 5) * 100);
      const trackRecord = Math.round((Math.min(agent.total_hires, 10) / 10) * 100);
      const categorySafety = CATEGORY_RISK_PROFILE[agent.category]?.safetyScore ?? 50;
      const affordability = Math.round(affordabilityScore(agent.pricing_type, agent.pricing_value));
      const onchainBonus = agent.onchain_reputation && agent.onchain_reputation > 0
        ? Math.min(agent.onchain_reputation, 100) * 0.15
        : 0;

      const winnerScore = objectiveFit * 0.4 + rating * 0.3 + trackRecord * 0.2 + onchainBonus;

      return {
        id: agent.id,
        name: agent.name,
        category: agent.category,
        description: agent.description,
        pricing_type: agent.pricing_type,
        pricing_value: agent.pricing_value,
        pricing_currency: agent.pricing_currency,
        avg_rating: agent.avg_rating,
        total_hires: agent.total_hires,
        onchain_reputation: agent.onchain_reputation,
        source: agent.source,
        scores: {
          objective_fit: objectiveFit,
          rating,
          track_record: trackRecord,
          category_safety: categorySafety,
          affordability,
        },
        winner_score: Math.round(winnerScore * 10) / 10,
      };
    };

    const [sideA, sideB] = await Promise.all([buildSide(agentA), buildSide(agentB)]);
    const winner = sideA.winner_score >= sideB.winner_score ? 'A' : 'B';

    return NextResponse.json({
      objective,
      agentA: sideA,
      agentB: sideB,
      winner,
      radar_axes: ['Objective fit', 'Rating', 'Track record', 'Category safety*', 'Affordability'],
      note: '*Category safety is a fixed risk profile per category, not agent-specific analysis — excluded from the winner score.',
    });
  } catch (error) {
    console.error('Arena API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
