/**
 * Classifies real ERC-8004 agents indexed from 8004scan into the 4 agent
 * categories required by the BNB Chain "Build the Era" hackathon.
 *
 * 8004scan has no category field — only free-text name/description — and its
 * full-text search matches loosely (e.g. long generic prompt templates like
 * the "EvoEvo AI Agent" family contain enough stray buzzwords to match almost
 * any search term). This classifier requires a category-specific phrase hit,
 * weighted toward the name and the description's opening, and rejects
 * ambiguous or low-confidence matches rather than force-fitting them.
 */

export type MarketplaceCategory =
  | 'rebalancing'
  | 'grid_trading'
  | 'yield_optimisation'
  | 'health_factor';

interface CategoryRule {
  category: MarketplaceCategory;
  /** Strong, near-unambiguous indicators. A single hit is enough signal. */
  primaryPhrases: string[];
  /** Weaker corroborating terms. Only count alongside a primary hit. */
  supportingPhrases: string[];
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'rebalancing',
    primaryPhrases: [
      'rebalanc', // covers rebalance/rebalancing/rebalancer
      'lp range',
      'range keeper',
      'portfolio drift',
      'target weights',
    ],
    supportingPhrases: ['concentrated-liquidity', 'concentrated liquidity', 'portfolio'],
  },
  {
    category: 'grid_trading',
    primaryPhrases: [
      'grid trad',
      'grid bot',
      'grid strategy',
      'grid planning',
      'grid ',
      'dca grid',
      'buy and sell ladders',
    ],
    supportingPhrases: ['pancakeswap', 'dca', 'ladder'],
  },
  {
    category: 'yield_optimisation',
    primaryPhrases: [
      'yield optimi',
      'yield harvest',
      'auto compound',
      'restak',
      'apy optimi',
    ],
    // 'vault' deliberately excluded even as supporting — real-world sample
    // showed it false-positives on gamified NFT/collectible agents ("Vault
    // Guardian" collectibles) that have nothing to do with yield strategies.
    supportingPhrases: ['beefy', 'venus', 'apy', 'lp management'],
  },
  {
    category: 'health_factor',
    primaryPhrases: [
      'health factor',
      'health-factor',
      'liquidation protection',
      'liquidation risk',
      'liquidation threshold',
      'rescue plan',
      'collateral ratio',
    ],
    supportingPhrases: ['liquidation', 'collateral', 'lending'],
  },
];

/** Generic prompt-template agent families with no real DeFi execution logic. */
const LOW_TRUST_MARKERS = ['evoevo ai agent', 'quantitative strategist'];

const PRIMARY_WEIGHT_NAME = 5;
const PRIMARY_WEIGHT_DESC_OPENING = 3;
const PRIMARY_WEIGHT_DESC_REST = 1.5;
const SUPPORTING_WEIGHT = 0.5;
const MIN_SCORE_TO_ACCEPT = 3;
const MIN_MARGIN_OVER_RUNNER_UP = 1.5;
const DESC_OPENING_CHARS = 160;

export interface ClassificationResult {
  category: MarketplaceCategory | null;
  score: number;
  scoresByCategory: Record<MarketplaceCategory, number>;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

/** Hyphens/underscores in agent names commonly stand in for spaces
 *  ("yield-optimizer", "grid_trader") — normalize before phrase matching. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[-_]/g, ' ');
}

export function classifyAgent(name: string, description: string): ClassificationResult {
  const nameLower = normalize(name);
  const descLower = normalize(description);
  const descOpening = descLower.slice(0, DESC_OPENING_CHARS);
  const descRest = descLower.slice(DESC_OPENING_CHARS);

  const isLowTrust = LOW_TRUST_MARKERS.some((marker) => descLower.includes(marker));

  const scores: Record<MarketplaceCategory, number> = {
    rebalancing: 0,
    grid_trading: 0,
    yield_optimisation: 0,
    health_factor: 0,
  };

  for (const rule of CATEGORY_RULES) {
    let score = 0;
    let hasPrimaryHit = false;

    for (const phrase of rule.primaryPhrases) {
      if (countOccurrences(nameLower, phrase) > 0) {
        score += PRIMARY_WEIGHT_NAME;
        hasPrimaryHit = true;
      }
      if (countOccurrences(descOpening, phrase) > 0) {
        score += PRIMARY_WEIGHT_DESC_OPENING;
        hasPrimaryHit = true;
      }
      const restHits = countOccurrences(descRest, phrase);
      if (restHits > 0) {
        score += Math.min(restHits, 3) * PRIMARY_WEIGHT_DESC_REST;
        hasPrimaryHit = true;
      }
    }

    // Supporting phrases only count once a primary phrase already matched —
    // they corroborate, they don't classify on their own (this is what
    // filters out the boilerplate-template false positives from raw search).
    if (hasPrimaryHit) {
      for (const phrase of rule.supportingPhrases) {
        if (descLower.includes(phrase)) {
          score += SUPPORTING_WEIGHT;
        }
      }
    }

    // Generic prompt-template agents get a heavy penalty rather than a hard
    // exclusion, so a genuinely well-described agent that happens to share
    // wording style isn't blanket-rejected.
    if (isLowTrust) {
      score *= 0.2;
    }

    scores[rule.category] = score;
  }

  const ranked = (Object.entries(scores) as [MarketplaceCategory, number][]).sort(
    (a, b) => b[1] - a[1]
  );
  const [topCategory, topScore] = ranked[0];
  const runnerUpScore = ranked[1]?.[1] ?? 0;

  const accepted =
    topScore >= MIN_SCORE_TO_ACCEPT && topScore - runnerUpScore >= MIN_MARGIN_OVER_RUNNER_UP;

  return {
    category: accepted ? topCategory : null,
    score: topScore,
    scoresByCategory: scores,
  };
}
