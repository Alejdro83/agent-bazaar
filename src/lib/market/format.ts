import type { AgentSignal } from './signals';

/** One-line, human-readable summary of a signal's result, for cards/detail. */
export function summarizeSignal(category: string, signal: AgentSignal): string {
  const r = signal.result as Record<string, number | string>;
  switch (category) {
    case 'health_factor':
      return `Max safe borrow: $${Number(r.max_safe_borrow_usd).toLocaleString()} (target HF ${signal.inputs.target_health_factor})`;
    case 'grid_trading':
      return `${r.grid_levels} grid levels · $${r.grid_spacing} spacing (${r.grid_spacing_pct}%)`;
    case 'yield_optimisation': {
      const candidates = signal.result.candidates as { source: string; apy: number }[];
      const best = candidates[0];
      return `Best now: ${best.source} @ ${best.apy.toFixed(2)}% APY`;
    }
    case 'rebalancing':
      return `Suggested range: ±${r.suggested_range_pct}%`;
    default:
      return '';
  }
}
