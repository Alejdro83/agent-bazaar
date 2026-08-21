'use client';

import { useState, useEffect } from 'react';
import { useTelegram } from '@/hooks/useTelegram';
import { MiniAppShell } from '@/components/miniapp/MiniAppShell';

// Seed data for demo — will be replaced with Supabase queries
const DEMO_AGENTS = [
  {
    id: '1',
    name: 'BeefyHarvester v2',
    description: 'Automatically harvests and restakes yield across Venus, PancakeSwap, and Beefy protocols. Optimizes for highest APY.',
    category: 'yield',
    pricing_type: 'percentage',
    pricing_value: 0.5,
    avg_rating: 4.8,
    total_hires: 340,
    status: 'active',
    avatar_url: null,
  },
  {
    id: '2',
    name: 'GridBot Pro',
    description: 'Runs automated grid trading strategies on PancakeSwap. Buy low, sell high within configurable price ranges.',
    category: 'trading',
    pricing_type: 'fixed',
    pricing_value: 25,
    avg_rating: 4.5,
    total_hires: 128,
    status: 'active',
    avatar_url: null,
  },
  {
    id: '3',
    name: 'LiquidationShield',
    description: 'Monitors your lending positions on Venus and Aave. Automatically adds collateral before liquidation threshold.',
    category: 'defi',
    pricing_type: 'fixed',
    pricing_value: 10,
    avg_rating: 4.9,
    total_hires: 512,
    status: 'active',
    avatar_url: null,
  },
  {
    id: '4',
    name: 'WhaleTracker',
    description: 'Real-time alerts when large wallets move BNB, USDT, or top tokens. Know what smart money does before everyone else.',
    category: 'monitoring',
    pricing_type: 'free',
    pricing_value: 0,
    avg_rating: 4.2,
    total_hires: 890,
    status: 'active',
    avatar_url: null,
  },
  {
    id: '5',
    name: 'PancakeOptimizer',
    description: 'Finds the best liquidity pools on PancakeSwap, manages LP positions, and auto-compounds CAKE rewards.',
    category: 'yield',
    pricing_type: 'percentage',
    pricing_value: 0.3,
    avg_rating: 4.6,
    total_hires: 215,
    status: 'active',
    avatar_url: null,
  },
  {
    id: '6',
    name: 'GasGuard',
    description: 'Optimizes transaction timing to minimize gas costs. Batches transactions and waits for low-congestion periods.',
    category: 'analytics',
    pricing_type: 'free',
    pricing_value: 0,
    avg_rating: 4.0,
    total_hires: 67,
    status: 'active',
    avatar_url: null,
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All', icon: '🤖' },
  { id: 'yield', label: 'Yield', icon: '🌾' },
  { id: 'trading', label: 'Trading', icon: '📈' },
  { id: 'defi', label: 'DeFi', icon: '🏦' },
  { id: 'monitoring', label: 'Monitor', icon: '👁️' },
  { id: 'analytics', label: 'Analytics', icon: '📊' },
];

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    yield: 'bg-emerald-900/30 text-emerald-400',
    trading: 'bg-blue-900/30 text-blue-400',
    defi: 'bg-amber-900/30 text-amber-400',
    monitoring: 'bg-purple-900/30 text-purple-400',
    analytics: 'bg-cyan-900/30 text-cyan-400',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[category] || 'bg-gray-900/30 text-gray-400'}`}>
      {category}
    </span>
  );
}

function PricingBadge({ type, value }: { type: string; value: number }) {
  if (type === 'free') {
    return <span className="text-green-400 text-sm font-medium">Free</span>;
  }
  if (type === 'percentage') {
    return <span className="text-amber-400 text-sm font-medium">{value}% yield</span>;
  }
  return <span className="text-amber-400 text-sm font-medium">${value}/mo</span>;
}

function RatingStars({ rating, count }: { rating: number; count: number }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-amber-400">★</span>
      <span className="text-sm text-gray-300">{rating.toFixed(1)}</span>
      <span className="text-xs text-gray-500">({count})</span>
    </div>
  );
}

function AgentCard({ agent }: { agent: typeof DEMO_AGENTS[0] }) {
  const { haptic } = useTelegram();

  const handleClick = () => {
    haptic?.impactOccurred('light');
    // Navigate to agent detail
  };

  return (
    <div
      onClick={handleClick}
      className="agent-card rounded-xl border border-gray-800 bg-gray-900/50 p-4 cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center text-lg">
            {agent.category === 'yield' ? '🌾' : agent.category === 'trading' ? '📈' : agent.category === 'defi' ? '🏦' : agent.category === 'monitoring' ? '👁️' : '📊'}
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
  const [agents, setAgents] = useState(DEMO_AGENTS);

  const filteredAgents = agents.filter((agent) => {
    const matchesCategory = selectedCategory === 'all' || agent.category === selectedCategory;
    const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

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
      {/* Welcome Section */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-1">
          Welcome{user?.first_name ? `, ${user.first_name}` : ''} 👋
        </h2>
        <p className="text-gray-400">
          Discover and hire AI agents on BNB Chain
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative mb-4">
        <input
          type="text"
          placeholder="Search agents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3 pl-10 text-sm text-white placeholder-gray-500 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
          🔍
        </span>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setSelectedCategory(cat.id);
              useTelegram().haptic?.selectionChanged();
            }}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              selectedCategory === cat.id
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-gray-900/50 text-gray-400 border border-gray-800 hover:border-gray-700'
            }`}
          >
            <span>{cat.icon}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-center">
          <div className="text-lg font-bold text-amber-400">{DEMO_AGENTS.length}</div>
          <div className="text-xs text-gray-500">Agents</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-center">
          <div className="text-lg font-bold text-green-400">
            {DEMO_AGENTS.reduce((sum, a) => sum + a.total_hires, 0)}
          </div>
          <div className="text-xs text-gray-500">Total Hires</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-center">
          <div className="text-lg font-bold text-blue-400">
            {(DEMO_AGENTS.reduce((sum, a) => sum + a.avg_rating, 0) / DEMO_AGENTS.length).toFixed(1)}
          </div>
          <div className="text-xs text-gray-500">Avg Rating</div>
        </div>
      </div>

      {/* Agent List */}
      <div className="space-y-3 pb-20">
        {filteredAgents.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🤖</div>
            <h3 className="text-lg font-semibold text-white mb-1">No agents found</h3>
            <p className="text-sm text-gray-400">
              Try a different search or category
            </p>
          </div>
        ) : (
          filteredAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))
        )}
      </div>
    </MiniAppShell>
  );
}