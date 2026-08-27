'use client';

import Link from 'next/link';
import { Trophy, Star } from 'lucide-react';
import { CATEGORY_ICONS } from '@/lib/categories';
import { RadarChart } from './RadarChart';

interface AgentSide {
  id: string;
  name: string;
  category: string;
  description: string;
  pricing_type: string;
  pricing_value: number;
  pricing_currency: string;
  avg_rating: number;
  total_hires: number;
  onchain_reputation: number | null;
  source: string;
  scores: {
    objective_fit: number;
    rating: number;
    track_record: number;
    category_safety: number;
    affordability: number;
  };
  winner_score: number;
}

interface ArenaResult {
  objective: string;
  agentA: AgentSide;
  agentB: AgentSide;
  winner: 'A' | 'B';
  radar_axes: string[];
  note: string;
}

function formatPricing(a: AgentSide): string {
  if (a.pricing_type === 'free') return 'Free';
  if (a.pricing_type === 'percentage') return `${a.pricing_value}% of yield`;
  // Non-USD fixed pricing (currently just X402PayBot's testnet $U) settles
  // a flat token amount per hire, not a USD/mo subscription.
  if (a.pricing_currency !== 'USD') return `${a.pricing_value} ${a.pricing_currency}`;
  return `$${a.pricing_value}/mo`;
}

function AgentSidePanel({ side, isWinner, align }: { side: AgentSide; isWinner: boolean; align: 'left' | 'right' }) {
  const Icon = CATEGORY_ICONS[side.category];
  return (
    <div
      className={`relative rounded-2xl border p-4 transition-all ${
        isWinner ? 'border-amber-500/50 bg-amber-500/[0.06]' : 'border-gray-800 bg-gray-900/40'
      }`}
    >
      {isWinner && (
        <div className={`absolute -top-3 ${align === 'left' ? 'left-4' : 'right-4'} flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-bold text-gray-950`}>
          <Trophy className="h-3 w-3" strokeWidth={2.5} />
          Winner
        </div>
      )}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20">
          {Icon && <Icon className="h-5 w-5 text-amber-400" strokeWidth={2} />}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{side.name}</p>
          <p className="text-xs text-gray-500">{side.category.replace('_', ' ')}</p>
        </div>
      </div>
      <p className="mb-3 line-clamp-3 text-xs text-gray-400">{side.description}</p>
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-gray-300">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          {side.avg_rating.toFixed(1)} · {side.total_hires} hires
        </span>
        <span className="font-medium text-amber-400">{formatPricing(side)}</span>
      </div>
      <p className="mb-3 text-xs text-gray-600">
        Match score for this goal: <span className="font-semibold text-gray-300">{side.winner_score.toFixed(1)}</span>
      </p>
      <Link
        href={`/agent/${side.id}`}
        className="block rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 py-2 text-center text-sm font-semibold text-black"
      >
        View / Hire
      </Link>
    </div>
  );
}

export function ArenaCompare({ result }: { result: ArenaResult }) {
  return (
    <div>
      <p className="mb-4 text-center text-sm text-gray-400">
        &ldquo;{result.objective}&rdquo;
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <AgentSidePanel side={result.agentA} isWinner={result.winner === 'A'} align="left" />
        <AgentSidePanel side={result.agentB} isWinner={result.winner === 'B'} align="right" />
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900/30 p-4">
        <div className="mb-2 flex items-center justify-center gap-6 text-xs">
          <span className="flex items-center gap-1.5 text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> {result.agentA.name}
          </span>
          <span className="flex items-center gap-1.5 text-blue-400">
            <span className="h-2 w-2 rounded-full bg-blue-400" /> {result.agentB.name}
          </span>
        </div>
        <RadarChart
          axes={result.radar_axes}
          seriesA={[
            result.agentA.scores.objective_fit,
            result.agentA.scores.rating,
            result.agentA.scores.track_record,
            result.agentA.scores.category_safety,
            result.agentA.scores.affordability,
          ]}
          seriesB={[
            result.agentB.scores.objective_fit,
            result.agentB.scores.rating,
            result.agentB.scores.track_record,
            result.agentB.scores.category_safety,
            result.agentB.scores.affordability,
          ]}
        />
        <p className="mt-2 text-center text-[11px] text-gray-600">{result.note}</p>
      </div>
    </div>
  );
}
