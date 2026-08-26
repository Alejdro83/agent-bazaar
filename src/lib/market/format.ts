import type { AgentSignal } from './signals';

/** One-line, human-readable summary of a signal's result, for cards/detail. */
export function summarizeSignal(category: string, signal: AgentSignal): string {
  const r = signal.result as Record<string, number | string>;
  switch (category) {
    case 'health_factor':
      return `Max safe borrow: $${Number(r.max_safe_borrow_usd).toLocaleString()} (target HF ${signal.inputs.target_health_factor})`;
    case 'grid_trading':
      // Two strategies share this category — pancake_route's result shape
      // (route_legs/amount_out) is distinct from the ATR grid shape.
      if (r.route_legs !== undefined) {
        return `${r.amount_out} ${signal.inputs.to_symbol} for 1 ${signal.inputs.from_symbol} · ${r.route_legs} route leg${r.route_legs === 1 ? '' : 's'}`;
      }
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

/** One-line summary of a backtest track record (src/lib/market/backtest.ts) for the detail page. */
export function summarizeTrackRecord(tr: Record<string, unknown>): string {
  switch (tr.strategy) {
    case 'grid_trading':
      return `${tr.closed_trades} closed trades, ${tr.win_rate_pct}% win rate · ${tr.realized_return_pct}% return vs ${tr.buy_hold_return_pct}% buy-and-hold`;
    case 'health_factor':
      return tr.would_have_liquidated
        ? `Would have liquidated after ${tr.days_until_liquidation} days`
        : `Never liquidated over the observed window`;
    case 'yield_history':
      return `Mean ${tr.mean_apy_pct}% APY (${tr.worst_day_apy_pct}%–${tr.best_day_apy_pct}% range)`;
    default:
      return '';
  }
}
