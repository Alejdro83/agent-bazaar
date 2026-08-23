-- Concierge (semantic search): switch the dormant OpenAI/1536-dim scaffolding
-- to Cloudflare Workers AI's bge-base-en-v1.5 (768-dim, free tier) — no
-- OpenAI key needed. search_embeddings has never held real data (dead code
-- since it was written), so both the column type change and the function
-- signature change are safe on an empty table.

ALTER TABLE search_embeddings ALTER COLUMN embedding TYPE VECTOR(768);

-- One embedding per agent — also what makes `.upsert(..., { onConflict: 'agent_id' })`
-- from the indexing script/API route valid (re-embedding on agent update replaces
-- the row instead of erroring or duplicating).
ALTER TABLE search_embeddings ADD CONSTRAINT search_embeddings_agent_id_key UNIQUE (agent_id);

-- Deliberately NOT indexing with ivfflat: it's an approximate index that
-- needs enough rows per list to cluster meaningfully, and with a catalog
-- this small (dozens of agents) `lists = 10` is degenerate — verified this
-- the hard way, `ORDER BY embedding <=> query LIMIT n` combined with an
-- ivfflat index on this table silently returned zero rows regardless of
-- threshold (the coarse quantizer routes the query to a list that doesn't
-- contain the one matching row). A sequential scan over this row count is
-- sub-millisecond and always exact — revisit only if the catalog grows into
-- the thousands.
DROP INDEX IF EXISTS idx_search_embeddings_vector;

DROP FUNCTION IF EXISTS search_agents(VECTOR(1536), FLOAT, INT, agent_category);

CREATE OR REPLACE FUNCTION search_agents(
  query_embedding VECTOR(768),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 3,
  category_filter agent_category DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  category agent_category,
  subcategory TEXT,
  pricing_type pricing_type,
  pricing_value NUMERIC,
  pricing_currency TEXT,
  status agent_status,
  source agent_source,
  total_hires INTEGER,
  avg_rating NUMERIC,
  avatar_url TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.description,
    a.category,
    a.subcategory,
    a.pricing_type,
    a.pricing_value,
    a.pricing_currency,
    a.status,
    a.source,
    a.total_hires,
    a.avg_rating,
    a.avatar_url,
    1 - (se.embedding <=> query_embedding) AS similarity
  FROM agents a
  JOIN search_embeddings se ON se.agent_id = a.id
  WHERE a.status = 'active'
    AND (category_filter IS NULL OR a.category = category_filter)
    AND 1 - (se.embedding <=> query_embedding) > match_threshold
  ORDER BY se.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
