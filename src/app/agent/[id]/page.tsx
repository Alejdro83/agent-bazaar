'use client';

import { useState } from 'react';
import { useTelegram } from '@/hooks/useTelegram';
import { MiniAppShell } from '@/components/miniapp/MiniAppShell';
import { useParams } from 'next/navigation';

// Demo agent data — will be replaced with Supabase fetch
const DEMO_AGENT = {
  id: '1',
  name: 'BeefyHarvester v2',
  description: 'Automatically harvests and restakes yield across Venus, PancakeSwap, and Beefy protocols. Optimizes for highest APY by monitoring rate changes and rebalancing positions. Supports USDT, USDC, BNB, and CAKE pools.',
  category: 'yield',
  pricing_type: 'percentage',
  pricing_value: 0.5,
  avg_rating: 4.8,
  total_hires: 340,
  status: 'active',
  wallet_address: '0x1234...abcd',
  seller: { name: 'YieldLabs', rating: 4.9 },
  capabilities: [
    'Auto-harvest rewards from Venus, PancakeSwap, Beefy',
    'Restake compounds for maximum APY',
    'Supports USDT, USDC, BNB, CAKE pools',
    'Configurable risk tolerance',
    'Emergency withdrawal capability',
  ],
  permissions: [
    'Harvest rewards only',
    'Restake in same protocol',
    'NO principal withdrawal',
    'Max $50,000/day transaction limit',
    'Revocable at any time via Altana',
  ],
  stats: {
    avg_apy_boost: '+3.2%',
    total_value_locked: '$2.4M',
    uptime: '99.7%',
    avg_harvest_time: '4.2h',
  },
  reviews: [
    { user: 'CryptoFarmer', rating: 5, comment: 'Best yield optimizer I\'ve used. APY went up 3% on my Venus positions.' },
    { user: 'DeFiWhale', rating: 5, comment: 'Set it and forget it. Been running for 3 months with zero issues.' },
    { user: 'YieldHunter', rating: 4, comment: 'Works great, wish it supported more chains.' },
  ],
};

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={star <= rating ? 'text-amber-400' : 'text-gray-600'}
        >
          ★
        </span>
      ))}
    </div>
  );
}

export default function AgentDetailPage() {
  const { id } = useParams();
  const { haptic, user } = useTelegram();
  const [activeTab, setActiveTab] = useState<'overview' | 'reviews' | 'permissions'>('overview');
  const [isHiring, setIsHiring] = useState(false);

  const agent = DEMO_AGENT; // TODO: Fetch from Supabase by id

  const handleHire = async () => {
    haptic?.impactOccurred('heavy');
    setIsHiring(true);
    
    // TODO: Implement x402 payment flow
    // For now, simulate
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    haptic?.notificationOccurred('success');
    setIsHiring(false);
    
    // Send data back to bot
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.sendData(JSON.stringify({
        action: 'hire_confirmed',
        agent_id: agent.id,
        agent_name: agent.name,
        pricing: agent.pricing_type === 'percentage' 
          ? `${agent.pricing_value}% of yield` 
          : agent.pricing_type === 'free' 
            ? 'Free' 
            : `$${agent.pricing_value}/month`,
        contract_id: 'demo-contract-123',
      }));
    }
  };

  return (
    <MiniAppShell>
      {/* Back button would be handled by Telegram */}
      
      {/* Agent Header */}
      <div className="mb-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center text-3xl">
            🌾
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">{agent.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-900/30 text-emerald-400">
                {agent.category}
              </span>
              <span className="text-sm text-gray-400">by {agent.seller.name}</span>
            </div>
          </div>
        </div>

        <p className="text-gray-300 text-sm leading-relaxed">
          {agent.description}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
          <div className="text-xs text-gray-500 mb-1">Avg APY Boost</div>
          <div className="text-lg font-bold text-green-400">{agent.stats.avg_apy_boost}</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
          <div className="text-xs text-gray-500 mb-1">Total Hires</div>
          <div className="text-lg font-bold text-amber-400">{agent.total_hires}</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
          <div className="text-xs text-gray-500 mb-1">TVL</div>
          <div className="text-lg font-bold text-blue-400">{agent.stats.total_value_locked}</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
          <div className="text-xs text-gray-500 mb-1">Uptime</div>
          <div className="text-lg font-bold text-purple-400">{agent.stats.uptime}</div>
        </div>
      </div>

      {/* Rating */}
      <div className="flex items-center gap-3 mb-6 p-3 rounded-lg border border-gray-800 bg-gray-900/50">
        <RatingStars rating={Math.round(agent.avg_rating)} />
        <span className="text-lg font-bold text-white">{agent.avg_rating}</span>
        <span className="text-sm text-gray-400">({agent.total_hires} reviews)</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-900/50 rounded-lg p-1">
        {(['overview', 'reviews', 'permissions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              haptic?.selectionChanged();
            }}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-amber-500/20 text-amber-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mb-20">
        {activeTab === 'overview' && (
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-3">Capabilities</h3>
            <ul className="space-y-2">
              {agent.capabilities.map((cap, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="text-green-400 mt-0.5">✓</span>
                  {cap}
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="space-y-4">
            {agent.reviews.map((review, i) => (
              <div key={i} className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-white">{review.user}</span>
                  <RatingStars rating={review.rating} />
                </div>
                <p className="text-sm text-gray-400">{review.comment}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'permissions' && (
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-3">What this agent can do</h3>
            <ul className="space-y-2">
              {agent.permissions.map((perm, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className={perm.startsWith('NO') ? 'text-red-400 mt-0.5' : 'text-amber-400 mt-0.5'}>
                    {perm.startsWith('NO') ? '✗' : '⚡'}
                  </span>
                  {perm}
                </li>
              ))}
            </ul>
            <div className="mt-4 p-3 rounded-lg border border-amber-800/30 bg-amber-900/10">
              <p className="text-xs text-amber-400">
                🔒 Permissions are managed via Altana Smart Wallet and registered onchain. 
                You can revoke access instantly at any time.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Hire Button (Fixed at bottom) */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-950/90 backdrop-blur-sm border-t border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs text-gray-500">Price</div>
            <div className="text-xl font-bold text-amber-400">
              {agent.pricing_type === 'percentage' 
                ? `${agent.pricing_value}% of yield` 
                : agent.pricing_type === 'free' 
                  ? 'Free' 
                  : `$${agent.pricing_value}/month`}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Seller</div>
            <div className="text-sm text-gray-300">{agent.seller.name}</div>
          </div>
        </div>
        
        <button
          onClick={handleHire}
          disabled={isHiring}
          className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-lg hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isHiring ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span>
              Processing...
            </span>
          ) : (
            '🤝 Hire Agent'
          )}
        </button>
      </div>
    </MiniAppShell>
  );
}