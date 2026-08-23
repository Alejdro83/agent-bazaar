import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { identifyRequester } from '@/lib/auth/identify';

/**
 * POST /api/ratings — Rate an agent you've hired.
 *
 * The caller doesn't pick a contract explicitly — we find their own
 * active/completed contract for that agent server-side (one rating per
 * contract, enforced by ratings.contract_id UNIQUE).
 */
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

    const { agent_id, score, comment } = body;
    if (!agent_id) {
      return NextResponse.json({ error: 'Missing agent_id' }, { status: 400 });
    }
    if (typeof score !== 'number' || score < 1 || score > 5 || !Number.isInteger(score)) {
      return NextResponse.json({ error: 'score must be an integer between 1 and 5' }, { status: 400 });
    }

    // Find the caller's own contract for this agent — proof they actually hired it.
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('id')
      .eq('agent_id', agent_id)
      .eq('buyer_id', requester.id)
      .in('status', ['active', 'completed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'You can only rate agents you have hired' },
        { status: 403 }
      );
    }

    const { data: rating, error: insertError } = await supabase
      .from('ratings')
      .insert({
        contract_id: contract.id,
        agent_id,
        rater_id: requester.id,
        score,
        comment: comment || null,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'You already rated this hire' }, { status: 409 });
      }
      console.error('Supabase insert error:', insertError);
      return NextResponse.json({ error: 'Failed to submit rating' }, { status: 500 });
    }

    await supabase.rpc('update_agent_stats', { p_agent_id: agent_id });

    return NextResponse.json({ rating }, { status: 201 });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
