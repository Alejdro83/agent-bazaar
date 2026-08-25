/**
 * Runs a real-data backtest per self-hireable agent and merges the result
 * into agents.metadata.track_record (never overwriting the existing
 * strategy config). See src/lib/market/backtest.ts for methodology.
 *
 * Usage: npx tsx --env-file-if-exists=.env.local scripts/run-backtests.ts
 */

import { createServiceClient } from '../src/lib/supabase/service';
import { backtestGrid, backtestPoolHistory, backtestHealthFactor } from '../src/lib/market/backtest';
import type { Json } from '../src/types/database';

async function main() {
  const supabase = createServiceClient();
  const { data: agents, error } = await supabase
    .from('agents')
    .select('id, name, category, metadata')
    .eq('source', 'user')
    .eq('status', 'active');

  if (error || !agents) {
    console.error('Failed to fetch agents:', error);
    process.exit(1);
  }

  for (const agent of agents) {
    const metadata = (agent.metadata ?? {}) as Record<string, unknown>;
    let trackRecord: Record<string, unknown> | null = null;

    try {
      switch (agent.category) {
        case 'grid_trading':
          trackRecord = await backtestGrid({
            symbol: metadata.symbol as string | undefined,
            spacingAtrMultiple: Number(metadata.spacing_atr_multiple ?? 0.5),
            rangePct: Number(metadata.range_pct ?? 0.05),
          });
          break;
        case 'health_factor':
          trackRecord = await backtestHealthFactor({
            targetHealthFactor: Number(metadata.target_health_factor ?? 1.5),
          });
          break;
        case 'yield_optimisation': {
          const candidates = (metadata.candidates as { label: string; poolId: string }[] | undefined) ?? [];
          if (candidates.length === 0) break;
          trackRecord = await backtestPoolHistory({ poolId: candidates[0].poolId, label: candidates[0].label });
          break;
        }
        case 'rebalancing': {
          const poolId = metadata.pool_id as string | undefined;
          if (!poolId) break;
          trackRecord = await backtestPoolHistory({ poolId, label: `${agent.name}'s tracked pool` });
          break;
        }
      }
    } catch (err) {
      console.error(`  ✗ ${agent.name}: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    if (!trackRecord) {
      console.log(`  — ${agent.name}: no backtest available (missing config)`);
      continue;
    }

    const { error: updateError } = await supabase
      .from('agents')
      .update({ metadata: { ...metadata, track_record: trackRecord } as Json })
      .eq('id', agent.id);

    if (updateError) {
      console.error(`  ✗ ${agent.name}: failed to save — ${updateError.message}`);
    } else {
      console.log(`  ✓ ${agent.name}:`, JSON.stringify(trackRecord));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
