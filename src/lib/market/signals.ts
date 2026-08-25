/**
 * Combines a live market data fetch (venus/binance/defillama) with an
 * agent's own strategy config (agents.metadata) into one per-agent signal —
 * so two agents in the same category show different, real numbers instead
 * of a shared category-level lookup (the same Data Quality problem already
 * avoided when building the Arena, see src/app/api/arena/route.ts).
 */

import { computeHealthFactorSignal } from './venus';
import { computeGridSignal } from './binance';
import { computeYieldCompareSignal, computeRebalancingSignal } from './defillama';

export interface AgentSignal {
  task: string;
  data_sources: string[];
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
  elapsed_ms: number;
  timestamp: string;
}

interface SignalAgent {
  category: string;
  metadata: unknown;
}

export async function computeAgentSignal(agent: SignalAgent): Promise<AgentSignal> {
  const start = performance.now();
  const config = (agent.metadata ?? {}) as Record<string, unknown>;

  let task: string;
  let payload: { data_sources: string[]; inputs: Record<string, unknown>; result: Record<string, unknown> };

  switch (agent.category) {
    case 'health_factor': {
      const targetHealthFactor = Number(config.target_health_factor ?? 1.5);
      task = `Max safe borrow at target health factor ${targetHealthFactor}`;
      payload = await computeHealthFactorSignal({
        targetHealthFactor,
        collateralSymbol: config.collateral_symbol as string | undefined,
        borrowSymbol: config.borrow_symbol as string | undefined,
        collateralUsd: config.collateral_usd as number | undefined,
      });
      break;
    }
    case 'yield_optimisation': {
      const candidates = (config.candidates as { label: string; poolId: string }[] | undefined) ?? [];
      task = 'Best real stablecoin/BNB yield right now across tracked pools';
      payload = await computeYieldCompareSignal({ candidates });
      break;
    }
    case 'grid_trading': {
      const spacingAtrMultiple = Number(config.spacing_atr_multiple ?? 0.5);
      const rangePct = Number(config.range_pct ?? 0.05);
      task = `Grid spacing from real 24h volatility (${spacingAtrMultiple}x ATR)`;
      payload = await computeGridSignal({
        spacingAtrMultiple,
        rangePct,
        symbol: config.symbol as string | undefined,
      });
      break;
    }
    case 'rebalancing': {
      const poolId = config.pool_id as string | undefined;
      const rangeSigmaMultiple = Number(config.range_sigma_multiple ?? 1);
      if (!poolId) throw new Error('rebalancing agent missing metadata.pool_id');
      task = 'Suggested LP range width from real pool volatility';
      payload = await computeRebalancingSignal({ poolId, rangeSigmaMultiple });
      break;
    }
    default:
      throw new Error(`No signal available for category ${agent.category}`);
  }

  return {
    task,
    ...payload,
    elapsed_ms: Math.round(performance.now() - start),
    timestamp: new Date().toISOString(),
  };
}
