/**
 * Populates the marketplace catalog with real ERC-8004 agents indexed from
 * BSC via 8004scan — required for hackathon eligibility ("agents surfaced on
 * your marketplace must be live on BSC") and for the Data Quality / Agent
 * Diversity judging criteria.
 *
 * Dry-run by default: prints the ranked candidate shortlist per category for
 * review (some real-world agents use category-sounding words in unrelated
 * ways — see classify.ts — so a human check before writing to prod is
 * intentional, not a missing feature).
 *
 * Usage:
 *   npx tsx scripts/sync-8004scan.ts                 # dry run, prints shortlist
 *   npx tsx scripts/sync-8004scan.ts --commit         # writes to Supabase
 *   npx tsx scripts/sync-8004scan.ts --commit --mainnet-only
 */

import { findCandidates, commitCandidates, type CandidateAgent } from '../src/lib/eightoofourscan/sync';
import type { MarketplaceCategory } from '../src/lib/eightoofourscan/classify';

const CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
  rebalancing: 'Rebalancing',
  grid_trading: 'Grid Trading',
  yield_optimisation: 'Yield Optimisation',
  health_factor: 'Health Factor',
};

function printShortlist(byCategory: Record<MarketplaceCategory, CandidateAgent[]>, rejectedCount: number) {
  for (const category of Object.keys(byCategory) as MarketplaceCategory[]) {
    const items = byCategory[category];
    console.log(`\n=== ${CATEGORY_LABELS[category]} (${items.length}) ===`);
    for (const { agent, score } of items) {
      const net = agent.is_testnet ? 'testnet' : 'mainnet';
      console.log(
        `  [score ${score.toFixed(1)}] ${agent.name}  (chain ${agent.chain_id}/${net}, rep ${agent.average_score.toFixed(2)})`
      );
      console.log(`      ${agent.description.slice(0, 140).replace(/\n/g, ' ')}`);
    }
  }
  console.log(`\nRejected (no confident category match): ${rejectedCount}`);
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const mainnetOnly = args.includes('--mainnet-only');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const perCategoryLimit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

  console.log(`Fetching candidates from 8004scan (${mainnetOnly ? 'mainnet only' : 'mainnet + testnet'})...`);
  const { byCategory, rejectedCount } = await findCandidates({ includeTestnet: !mainnetOnly, perCategoryLimit });

  printShortlist(byCategory, rejectedCount);

  if (!commit) {
    console.log('\nDry run only — pass --commit to write these to Supabase.');
    return;
  }

  const { inserted, skipped } = await commitCandidates(byCategory);
  console.log(`\nCommitted ${inserted} agents (${skipped} errors).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
