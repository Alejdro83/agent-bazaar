'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bot, Search, Star, ShieldCheck, TrendingUp } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { MiniAppShell } from '@/components/miniapp/MiniAppShell';
import { CATEGORY_ICONS } from '@/lib/categories';
import { summarizeSignal } from '@/lib/market/format';
import type { AgentSignal } from '@/lib/market/signals';

function timeAgo(isoDate: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return 'moments ago';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
  pricing_type: string;
  pricing_value: number;
  avg_rating: number;
  total_hires: number;
  status: string;
  avatar_url: string | null;
  source: string;
  erc8004_data: {
    star_count?: number;
    total_feedbacks?: number;
    is_verified?: boolean;
    supported_protocols?: string[];
  } | null;
}

const CATEGORIES = [
  { id: 'all', label: 'All', icon: Bot },
  { id: 'rebalancing', label: 'Rebalancing', icon: CATEGORY_ICONS.rebalancing },
  { id: 'grid_trading', label: 'Grid Trading', icon: CATEGORY_ICONS.grid_trading },
  { id: 'yield_optimisation', label: 'Yield', icon: CATEGORY_ICONS.yield_optimisation },
  { id: 'health_factor', label: 'Health Factor', icon: CATEGORY_ICONS.health_factor },
];

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    rebalancing: 'bg-blue-900/30 text-blue-400',
    grid_trading: 'bg-purple-900/30 text-purple-400',
    yield_optimisation: 'bg-emerald-900/30 text-emerald-400',
    health_factor: 'bg-amber-900/30 text-amber-400',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        colors[category] || 'bg-gray-900/30 text-gray-400'
      }`}
    >
      {category}
    </span>
  );
}

function PricingBadge({ type, value }: { type: string; value: number }) {
  if (type === 'free') {
    return <span className="text-green-400 text-sm font-medium">Free</span>;
  }
  if (type === 'percentage') {
    return (
      <span className="text-amber-400 text-sm font-medium">{value}% yield</span>
    );
  }
  return (
    <span className="text-amber-400 text-sm font-medium">${value}/mo</span>
  );
}

function RatingStars({ rating, count }: { rating: number; count: number }) {
  return (
    <div className="flex items-center gap-1">
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      <span className="text-sm text-gray-300">{rating.toFixed(1)}</span>
      <span className="text-xs text-gray-500">({count})</span>
    </div>
  );
}

/** Real, category-specific live number for our own hireable agents — see src/lib/market/signals.ts. */
function LiveSignalLine({ agentId, category }: { agentId: string; category: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/market/signal?agent_id=${agentId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { signal: AgentSignal }) => {
        if (!cancelled) setText(summarizeSignal(category, data.signal));
      })
      .catch(() => {
        // Best-effort — a card without a live signal still shows everything else.
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, category]);

  if (!text) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-emerald-400 mb-2">
      <TrendingUp className="h-3 w-3 shrink-0" strokeWidth={2} />
      <span className="truncate">{text}</span>
    </div>
  );
}

/** Real onchain reputation for 8004scan-indexed agents — already fetched, no extra call. */
function ReputationLine({ data }: { data: NonNullable<Agent['erc8004_data']> }) {
  if (!data.total_feedbacks && !data.star_count) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
      {data.is_verified && (
        <span className="flex items-center gap-1 text-blue-400">
          <ShieldCheck className="h-3 w-3" strokeWidth={2} /> Verified
        </span>
      )}
      {!!data.star_count && <span>★ {data.star_count}</span>}
      {!!data.total_feedbacks && <span>{data.total_feedbacks} onchain feedbacks</span>}
    </div>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  const { haptic } = useTelegram();

  const handleClick = () => {
    haptic?.impactOccurred('light');
    window.location.href = `/agent/${agent.id}`;
  };

  const CategoryIcon = CATEGORY_ICONS[agent.category] ?? Bot;

  return (
    <div
      onClick={handleClick}
      className="agent-card rounded-xl border border-gray-800 bg-gray-900/50 p-4 cursor-pointer hover:border-amber-500/30 transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <CategoryIcon className="h-5 w-5 text-amber-400" strokeWidth={2} />
          </div>
          <div>
            <h3 className="font-semibold text-white">{agent.name}</h3>
            <CategoryBadge category={agent.category} />
          </div>
        </div>
        <PricingBadge type={agent.pricing_type} value={agent.pricing_value} />
      </div>

      <p className="text-sm text-gray-400 mb-3 line-clamp-2">
        {agent.description}
      </p>

      {agent.source === 'user' && <LiveSignalLine agentId={agent.id} category={agent.category} />}
      {agent.source === '8004scan' && agent.erc8004_data && <ReputationLine data={agent.erc8004_data} />}

      <div className="flex items-center justify-between">
        <RatingStars rating={agent.avg_rating} count={agent.total_hires} />
        <span className="text-xs text-gray-500">
          {agent.total_hires} hires
        </span>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { user, isLoading } = useTelegram();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (selectedCategory !== 'all') params.set('category', selectedCategory);
      if (searchQuery) params.set('search', searchQuery);
      params.set('limit', '20');

      const res = await fetch(`/api/agents?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch agents');

      const data = await res.json();
      setAgents(data.agents);
      if (data.last_synced_at) setLastSyncedAt(data.last_synced_at);
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Failed to load agents. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchQuery]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  if (isLoading) {
    return (
      <MiniAppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
        </div>
      </MiniAppShell>
    );
  }

  return (
    <MiniAppShell>
      {/* Welcome */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-1">
          {user ? `Hey, ${user.first_name}!` : 'Welcome!'}
        </h2>
        <p className="text-gray-400">Find the perfect AI agent for your needs</p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <input
          type="text"
          placeholder="Search agents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3 pl-10 text-sm text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-500" />
      </div>

      {/* Categories */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
              selectedCategory === cat.id
                ? 'bg-amber-500 text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <cat.icon className="h-3.5 w-3.5" strokeWidth={2.25} />
            {cat.label}
          </button>
        ))}
      </div>

      {lastSyncedAt && (
        <p className="mb-4 text-xs text-gray-600">
          BSC catalog synced {timeAgo(lastSyncedAt)}
        </p>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={fetchAgents}
            className="mt-2 text-sm text-amber-400 hover:text-amber-300"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-400"></div>
        </div>
      )}

      {/* Agent list */}
      {!loading && !error && (
        <div className="space-y-3">
          {agents.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg mb-2">No agents found</p>
              <p className="text-gray-600 text-sm">
                Try a different search or category
              </p>
            </div>
          ) : (
            agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)
          )}
        </div>
      )}

      {/* Results count */}
      {!loading && agents.length > 0 && (
        <p className="text-center text-gray-600 text-xs mt-4">
          Showing {agents.length} agents
        </p>
      )}
    </MiniAppShell>
  );
}
