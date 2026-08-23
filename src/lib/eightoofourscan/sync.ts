/**
 * Builds a curated list of real ERC-8004 agents from BSC to seed the
 * marketplace catalog — one candidate list per required hackathon category.
 *
 * Deliberately NOT fully automated end-to-end: 8004scan's full-text search
 * produces genuine ambiguous cases that keyword classification alone can't
 * resolve (e.g. an agent using "rebalancing" in a Yin-Yang metaphysics
 * sense). This module proposes ranked candidates; a human reviews the
 * shortlist before it's committed to the database (see scripts/sync-8004scan.ts).
 */

import { listAllAgents, BSC_MAINNET_CHAIN_ID, BSC_TESTNET_CHAIN_ID, type EightOOFourScanAgent } from './client';
import { classifyAgent, type MarketplaceCategory } from './classify';

// Search terms broad enough to surface real candidates per category; the
// classifier (not this list) is what actually decides the final category.
const SEARCH_TERMS_BY_CATEGORY: Record<MarketplaceCategory, string[]> = {
  rebalancing: ['rebalanc', 'lp range', 'portfolio'],
  grid_trading: ['grid trad', 'grid bot', 'grid strategy', 'dca grid'],
  yield_optimisation: ['yield optim', 'yield harvest', 'auto-compound', 'apy optim'],
  health_factor: ['health factor', 'liquidation protection', 'liquidation risk', 'rescue'],
};

export interface CandidateAgent {
  agent: EightOOFourScanAgent;
  category: MarketplaceCategory;
  score: number;
}

export interface SyncCandidates {
  byCategory: Record<MarketplaceCategory, CandidateAgent[]>;
  rejectedCount: number;
}

/**
 * Fetches candidates across BSC mainnet + testnet for all 4 categories,
 * classifies each uniquely-seen agent once, and groups accepted ones by
 * their actual classified category (which may differ from the search term
 * that surfaced them).
 */
export async function findCandidates(options?: {
  includeTestnet?: boolean;
  perCategoryLimit?: number;
}): Promise<SyncCandidates> {
  const includeTestnet = options?.includeTestnet ?? true;
  const perCategoryLimit = options?.perCategoryLimit ?? 8;
  const chainIds = includeTestnet ? [BSC_MAINNET_CHAIN_ID, BSC_TESTNET_CHAIN_ID] : [BSC_MAINNET_CHAIN_ID];

  const seen = new Map<string, EightOOFourScanAgent>();

  for (const chainId of chainIds) {
    for (const terms of Object.values(SEARCH_TERMS_BY_CATEGORY)) {
      for (const term of terms) {
        const items = await listAllAgents({ chainId, search: term }, 100);
        for (const item of items) {
          if (!seen.has(item.id)) seen.set(item.id, item);
        }
      }
    }
  }

  const byCategory: Record<MarketplaceCategory, CandidateAgent[]> = {
    rebalancing: [],
    grid_trading: [],
    yield_optimisation: [],
    health_factor: [],
  };
  let rejectedCount = 0;

  for (const agent of seen.values()) {
    const result = classifyAgent(agent.name, agent.description);
    if (!result.category) {
      rejectedCount++;
      continue;
    }
    byCategory[result.category].push({ agent, category: result.category, score: result.score });
  }

  for (const category of Object.keys(byCategory) as MarketplaceCategory[]) {
    byCategory[category].sort((a, b) => b.score - a.score || b.agent.average_score - a.agent.average_score);
    byCategory[category] = byCategory[category].slice(0, perCategoryLimit);
  }

  return { byCategory, rejectedCount };
}
