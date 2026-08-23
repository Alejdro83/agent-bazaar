-- Agent Bazaar - Supabase Schema
-- Run this in Supabase SQL Editor

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create custom types
-- Categories match BNB Chain "Build the Era" hackathon's required agent categories
CREATE TYPE agent_category AS ENUM ('rebalancing', 'grid_trading', 'yield_optimisation', 'health_factor');
CREATE TYPE agent_status AS ENUM ('draft', 'active', 'paused', 'archived');
CREATE TYPE contract_status AS ENUM ('pending', 'active', 'completed', 'cancelled', 'expired');
CREATE TYPE pricing_type AS ENUM ('free', 'fixed', 'percentage');
CREATE TYPE agent_source AS ENUM ('user', '8004scan');

-- Agents table
CREATE TABLE agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  seller_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category agent_category NOT NULL,
  subcategory TEXT,
  pricing_type pricing_type NOT NULL DEFAULT 'free',
  pricing_value NUMERIC NOT NULL DEFAULT 0,
  pricing_currency TEXT NOT NULL DEFAULT 'USD',
  wallet_address TEXT NOT NULL,
  -- Real ERC-8004 Identity Registry token id (Fase 4) — UNIQUE because it's
  -- the on-chain identity handed to exactly one agent; NULL while
  -- registration is in flight or for pre-Fase-4 rows.
  erc8004_id TEXT UNIQUE,
  erc8004_data JSONB,
  -- Registration transaction hash on BSC testnet/mainnet — lets the UI link
  -- straight to BscScan instead of just showing the registry token id.
  onchain_tx_hash TEXT,
  status agent_status NOT NULL DEFAULT 'draft',
  metadata JSONB,
  avatar_url TEXT,
  total_hires INTEGER NOT NULL DEFAULT 0,
  avg_rating NUMERIC NOT NULL DEFAULT 0,
  total_revenue NUMERIC NOT NULL DEFAULT 0,
  -- Provenance: 'user' = listed via our wizard (hireable), '8004scan' = indexed real
  -- ERC-8004 identity from BSC (browse-only, links out to 8004scan/BscScan)
  source agent_source NOT NULL DEFAULT 'user',
  chain_id INTEGER,
  is_testnet BOOLEAN,
  external_agent_id TEXT UNIQUE,
  onchain_reputation NUMERIC,
  -- Generated column for full-text search — lets the API pass user input as
  -- a plain tsquery *value* (via .textSearch()) instead of interpolating it
  -- into PostgREST's filter *syntax* (the old `.or(ilike...)` approach let a
  -- search string like "x,status.eq.draft" inject extra filter conditions).
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', name || ' ' || description)
  ) STORED
);

-- Contracts table
CREATE TABLE contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  buyer_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  status contract_status NOT NULL DEFAULT 'pending',
  pricing_type pricing_type NOT NULL,
  pricing_value NUMERIC NOT NULL,
  pricing_currency TEXT NOT NULL DEFAULT 'USD',
  payment_tx_hash TEXT,
  altana_session_key TEXT,
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB
);

-- Ratings table
CREATE TABLE ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  contract_id UUID NOT NULL UNIQUE REFERENCES contracts(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  rater_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
  comment TEXT,
  metadata JSONB
);

-- Search embeddings table (for semantic search)
CREATE TABLE search_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  embedding VECTOR(1536),
  content TEXT NOT NULL
);

-- Indexes
CREATE INDEX idx_agents_seller ON agents(seller_id);
CREATE INDEX idx_agents_category ON agents(category);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_search_vector ON agents USING GIN(search_vector);
CREATE INDEX idx_contracts_agent ON contracts(agent_id);
CREATE INDEX idx_contracts_buyer ON contracts(buyer_id);
CREATE INDEX idx_contracts_seller ON contracts(seller_id);
CREATE INDEX idx_ratings_agent ON ratings(agent_id);
CREATE INDEX idx_search_embeddings_agent ON search_embeddings(agent_id);

-- Function: update agent stats
CREATE OR REPLACE FUNCTION update_agent_stats(p_agent_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE agents SET
    total_hires = (SELECT COUNT(*) FROM contracts WHERE agent_id = p_agent_id AND status IN ('active', 'completed')),
    avg_rating = COALESCE((SELECT AVG(score) FROM ratings WHERE agent_id = p_agent_id), 0),
    total_revenue = COALESCE((SELECT SUM(pricing_value) FROM contracts WHERE agent_id = p_agent_id AND status = 'completed'), 0),
    updated_at = NOW()
  WHERE id = p_agent_id;
END;
$$ LANGUAGE plpgsql;

-- Function: semantic search agents
CREATE OR REPLACE FUNCTION search_agents(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
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
  seller_id TEXT,
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
    a.seller_id,
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

-- Trigger: update updated_at on agents
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS (Row Level Security)
--
-- Telegram Mini App auth is NOT Supabase Auth — there is no auth.uid() to
-- key policies on. So the model here is deliberately simple:
--   - Our own Next.js API routes are the only trusted writer. They connect
--     with SUPABASE_SERVICE_ROLE_KEY (see src/lib/supabase/service.ts),
--     which bypasses RLS entirely, and enforce authorization themselves by
--     validating Telegram initData and checking seller_id ownership.
--   - The anon key (public by design, shipped to the browser as
--     NEXT_PUBLIC_SUPABASE_ANON_KEY) gets READ-ONLY access to what's already
--     public. No INSERT/UPDATE/DELETE policy exists for anon on any table,
--     which means those are denied by default — even if the anon key leaks
--     or someone bypasses our API and hits PostgREST directly, the worst
--     case is reading data that's already public, never writing.
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_active_agents" ON agents
  FOR SELECT TO anon USING (status = 'active');

CREATE POLICY "anon_select_ratings" ON ratings
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_embeddings" ON search_embeddings
  FOR SELECT TO anon USING (true);

-- No anon policy on `contracts` (buyer/seller identities, payment hashes) —
-- reads and writes both denied by default for the public key.

-- Baseline privileges. RLS only ever *restricts* what a GRANT already
-- allows — without these, Postgres denies before RLS is even evaluated.
-- service_role has the BYPASSRLS role attribute (set by Supabase at
-- project creation) so it still needs the table-level GRANT, but RLS
-- policies don't apply to it.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON agents, ratings, search_embeddings TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;