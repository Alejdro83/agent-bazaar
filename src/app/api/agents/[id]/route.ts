import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { identifyRequester } from '@/lib/auth/identify';
import type { AgentUpdate } from '@/types/database';

/**
 * GET /api/agents/[id] — Get agent detail
 * PUT /api/agents/[id] — Update agent (owner only)
 * DELETE /api/agents/[id] — Soft-delete agent (owner only)
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServiceClient();
    const { id } = await params;

    const { data: agent, error } = await supabase
      .from('agents')
      .select(
        'id, name, description, category, subcategory, pricing_type, pricing_value, pricing_currency, wallet_address, status, avatar_url, total_hires, avg_rating, total_revenue, source, chain_id, is_testnet, onchain_reputation, external_agent_id, erc8004_id, erc8004_data, onchain_tx_hash, metadata, created_at'
      )
      .eq('id', id)
      .single();

    if (error || !agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Fetch ratings for this agent — rater_id excluded (PII, not needed to render a review)
    const { data: ratings } = await supabase
      .from('ratings')
      .select('id, score, comment, created_at')
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServiceClient();

    const requester = identifyRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Auth required' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from('agents')
      .select('seller_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (existing.seller_id !== requester.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Partial merge — only touch fields the caller actually sent. Writing
    // every field unconditionally (the previous behavior) sent `null` for
    // any omitted field, which violated the NOT NULL columns on a partial
    // PATCH-style update.
    const updates: AgentUpdate = {};
    const patchable = [
      'name', 'description', 'category', 'subcategory',
      'pricing_type', 'pricing_value', 'pricing_currency',
      'wallet_address', 'metadata',
    ] as const;
    for (const field of patchable) {
      if (body[field] !== undefined) {
        (updates as Record<string, unknown>)[field] = body[field];
      }
    }

    // Update agent
    const { data: agent, error } = await supabase
      .from('agents')
      .update(updates)
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServiceClient();

    const requester = identifyRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Auth required' }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const { data: existing } = await supabase
      .from('agents')
      .select('seller_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (existing.seller_id !== requester.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Soft delete (archived agents are excluded from the default browse listing)
    const { error } = await supabase
      .from('agents')
      .update({ status: 'archived' })
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
