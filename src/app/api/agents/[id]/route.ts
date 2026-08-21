import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

// GET /api/agents/[id] — Get agent details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient();
  const { id } = params;

  const { data: agent, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // Fetch ratings
  const { data: ratings } = await supabase
    .from('ratings')
    .select('*')
    .eq('agent_id', id)
    .order('created_at', { ascending: false })
    .limit(10);

  return NextResponse.json({ agent, ratings: ratings || [] });
}

// PATCH /api/agents/[id] — Update agent
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient();
  const { id } = params;
  const body = await request.json();

  const { data, error } = await supabase
    .from('agents')
    .update(body)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ agent: data });
}

// DELETE /api/agents/[id] — Delete agent (soft delete via status)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient();
  const { id } = params;

  const { error } = await supabase
    .from('agents')
    .update({ status: 'archived' })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}