-- RLS Policies for Agent Bazaar
-- Run AFTER schema.sql and seed.sql
-- These replace the permissive demo policies with production-ready ones

-- First, drop the permissive demo policies
DROP POLICY IF EXISTS "Agents are viewable by everyone" ON agents;
DROP POLICY IF EXISTS "Users can insert their own agents" ON agents;
DROP POLICY IF EXISTS "Users can update their own agents" ON agents;
DROP POLICY IF EXISTS "Contracts viewable by parties" ON contracts;
DROP POLICY IF EXISTS "Users can insert contracts" ON contracts;
DROP POLICY IF EXISTS "Ratings viewable by everyone" ON ratings;
DROP POLICY IF EXISTS "Users can insert ratings" ON ratings;
DROP POLICY IF EXISTS "Embeddings viewable by everyone" ON search_embeddings;
DROP POLICY IF EXISTS "System can manage embeddings" ON search_embeddings;

-- ============================================================
-- AGENTS
-- ============================================================

-- Anyone can view active agents
CREATE POLICY "agents_select_active"
  ON agents FOR SELECT
  USING (status = 'active');

-- Sellers can view their own agents (any status)
CREATE POLICY "agents_select_own"
  ON agents FOR SELECT
  USING (seller_id = current_setting('app.telegram_user_id', true));

-- Authenticated users can insert agents (they become the seller)
CREATE POLICY "agents_insert"
  ON agents FOR INSERT
  WITH CHECK (
    seller_id = current_setting('app.telegram_user_id', true)
    AND current_setting('app.telegram_user_id', true) IS NOT NULL
  );

-- Sellers can update their own agents
CREATE POLICY "agents_update_own"
  ON agents FOR UPDATE
  USING (seller_id = current_setting('app.telegram_user_id', true))
  WITH CHECK (seller_id = current_setting('app.telegram_user_id', true));

-- Sellers can soft-delete their own agents
CREATE POLICY "agents_delete_own"
  ON agents FOR UPDATE
  USING (
    seller_id = current_setting('app.telegram_user_id', true)
    AND status != 'deleted'
  );

-- ============================================================
-- CONTRACTS
-- ============================================================

-- Buyers can view their own contracts
CREATE POLICY "contracts_select_buyer"
  ON contracts FOR SELECT
  USING (buyer_id = current_setting('app.telegram_user_id', true));

-- Sellers can view contracts for their agents
CREATE POLICY "contracts_select_seller"
  ON contracts FOR SELECT
  USING (seller_id = current_setting('app.telegram_user_id', true));

-- Authenticated users can create contracts (they become the buyer)
CREATE POLICY "contracts_insert"
  ON contracts FOR INSERT
  WITH CHECK (
    buyer_id = current_setting('app.telegram_user_id', true)
    AND current_setting('app.telegram_user_id', true) IS NOT NULL
  );

-- ============================================================
-- RATINGS
-- ============================================================

-- Anyone can view ratings
CREATE POLICY "ratings_select"
  ON ratings FOR SELECT
  USING (true);

-- Users can insert ratings for contracts they were the buyer of
CREATE POLICY "ratings_insert"
  ON ratings FOR INSERT
  WITH CHECK (
    rater_id = current_setting('app.telegram_user_id', true)
    AND EXISTS (
      SELECT 1 FROM contracts
      WHERE contracts.id = contract_id
        AND contracts.buyer_id = current_setting('app.telegram_user_id', true)
        AND contracts.status IN ('active', 'completed')
    )
  );

-- ============================================================
-- SEARCH EMBEDDINGS
-- ============================================================

-- Anyone can read embeddings (for search)
CREATE POLICY "embeddings_select"
  ON search_embeddings FOR SELECT
  USING (true);

-- Only service role can manage embeddings (system function)
CREATE POLICY "embeddings_manage"
  ON search_embeddings FOR ALL
  USING (current_setting('role') = 'service_role');

-- ============================================================
-- HELPER: Set Telegram user context
-- ============================================================

-- Function to set the current user context from Telegram initData
-- Called by the API routes after validating initData
CREATE OR REPLACE FUNCTION set_telegram_user(p_user_id TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.telegram_user_id', p_user_id, true);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- VIEWS: Public agent listing (no auth required)
-- ============================================================

CREATE OR REPLACE VIEW public_agents AS
SELECT
  id,
  name,
  description,
  category,
  subcategory,
  pricing_type,
  pricing_value,
  pricing_currency,
  status,
  seller_id,
  total_hires,
  avg_rating,
  avatar_url,
  created_at
FROM agents
WHERE status = 'active';
