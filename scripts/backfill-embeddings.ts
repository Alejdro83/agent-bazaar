/**
 * One-off (and re-runnable) script: generate embeddings for every active
 * agent that doesn't have one yet, via Cloudflare Workers AI, and upsert
 * them into search_embeddings. Safe to re-run — upsert on agent_id.
 *
 * Usage: npx tsx --env-file-if-exists=.env.local scripts/backfill-embeddings.ts
 */

import { createClient } from '@supabase/supabase-js';
import { generateEmbeddings, buildAgentSearchText, toVectorLiteral } from '../src/lib/embeddings';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Missing Supabase env vars');

  const supabase = createClient(url, serviceRoleKey);

  const { data: agents, error } = await supabase
    .from('agents')
    .select('id, name, description, category, subcategory')
    .eq('status', 'active');
  if (error || !agents) throw error || new Error('No agents returned');

  const { data: existing } = await supabase.from('search_embeddings').select('agent_id');
  const alreadyEmbedded = new Set((existing || []).map((e) => e.agent_id));
  const pending = agents.filter((a) => !alreadyEmbedded.has(a.id));

  console.log(`${agents.length} active agents, ${pending.length} need embeddings.`);
  if (pending.length === 0) return;

  const texts = pending.map((a) => buildAgentSearchText(a));
  const embeddings = await generateEmbeddings(texts);

  let ok = 0;
  for (let i = 0; i < pending.length; i++) {
    const { error: upsertError } = await supabase.from('search_embeddings').upsert(
      {
        agent_id: pending[i].id,
        content: texts[i],
        embedding: toVectorLiteral(embeddings[i]),
      },
      { onConflict: 'agent_id' }
    );
    if (upsertError) {
      console.error(`✗ ${pending[i].name}:`, upsertError.message);
    } else {
      ok++;
      console.log(`✓ ${pending[i].name}`);
    }
  }
  console.log(`Done: ${ok}/${pending.length} embedded.`);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
