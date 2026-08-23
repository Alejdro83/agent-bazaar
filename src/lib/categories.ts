import { Scale, LayoutGrid, Sprout, ShieldCheck, type LucideIcon } from 'lucide-react';

/** Icon per hackathon-required agent category, shared by every card/badge that renders one. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  rebalancing: Scale,
  grid_trading: LayoutGrid,
  yield_optimisation: Sprout,
  health_factor: ShieldCheck,
};
