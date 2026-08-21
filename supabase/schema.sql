-- Agent Bazaar - Supabase Schema
-- Run this in Supabase SQL Editor

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create custom types
CREATE TYPE agent_category AS ENUM ('yield', 'trading', 'monitoring', 'defi', 'analytics', 'other');
CREATE TYPE agent_status AS ENUM ('draft', 'active', 'paused', 'archived');
CREATE TYPE contract_status AS ENUM ('pending', 'active', 'completed', 'cancelled', 'expired');
CREATE TYPE pricing_type AS ENUM ('free', 'fixed', 'percentage');

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
  erc8004_id TEXT,
  erc8004_data JSONB,
  status agent_status NOT NULL DEFAULT 'draft',
  metadata JSONB,
  avatar_url TEXT,
  total_hires INTEGER NOT NULL DEFAULT 0,
  avg_rating NUMERIC NOT NULL DEFAULT 0,
  total_revenue NUMERIC NOT NULL DEFAULT 0
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
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
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

-- RLS (Row Level Security) - Enable in production
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_embeddings ENABLE ROW LEVEL SECURITY;

-- Policies (basic - customize for production)
CREATE POLICY "Agents are viewable by everyone" ON agents FOR SELECT USING (true);
CREATE POLICY "Users can insert their own agents" ON agents FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their own agents" ON agents FOR UPDATE USING (true);

CREATE POLICY "Contracts viewable by parties" ON contracts FOR SELECT USING (true);
CREATE POLICY "Users can insert contracts" ON contracts FOR INSERT WITH CHECK (true);

CREATE POLICY "Ratings viewable by everyone" ON ratings FOR SELECT USING (true);
CREATE POLICY "Users can insert ratings" ON ratings FOR INSERT WITH CHECK (true);

CREATE POLICY "Embeddings viewable by everyone" ON search_embeddings FOR SELECT USING (true);
CREATE POLICY "System can manage embeddings" ON search_embeddings FOR ALL USING (true);