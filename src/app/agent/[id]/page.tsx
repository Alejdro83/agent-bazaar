'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTelegram } from '@/hooks/useTelegram';
import { MiniAppShell } from '@/components/miniapp/MiniAppShell';

interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategory: string | null;
  pricing_type: string;
  pricing_value: number;
  pricing_currency: string;
  wallet_address: string;
  status: string;
  avatar_url: string | null;
  total_hires: number;
  avg_rating: number;
  total_revenue: number;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface Rating {
  id: string;
  score: number;
  comment: string | null;
  created_at: string;
  rater_id: string;
}

export default function AgentDetailPage() {
  const params = useParams();
  const { haptic, mainButton, user, isAuthenticated } = useTelegram();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'about' | 'reviews' | 'terms'>('about');
  const [hiring, setHiring] = useState(false);

  useEffect(() => {
    const fetchAgent = async () => {
      try {
        const res = await fetch(`/api/agents/${params.id}`);
        if (!res.ok) throw new Error('Agent not found');
        const data = await res.json();
        setAgent(data.agent);
        setRatings(data.ratings);
      } catch (err) {
        setError('Agent not found');
      } finally {
        setLoading(false);
      }
    };
    fetchAgent();
  }, [params.id]);

  // Setup Main Button for hire
  useEffect(() => {
    if (!agent || !mainButton) return;

    mainButton.text = `Hire — ${agent.pricing_type === 'free' ? 'Free' : agent.pricing_type === 'percentage' ? `${agent.pricing_value}% yield` : `$${agent.pricing_value}/mo`}`;
    mainButton.show();
    mainButton.onClick(() => handleHire());

    return () => {
      mainButton.hide();
    };
  }, [agent, mainButton]);

  const handleHire = async () => {
    if (!agent || !user) return;

    haptic?.impactOccurred('medium');
    setHiring(true);

    try {
      // Mock x402 payment flow
      // In production: this would initiate an x402 payment via Altana wallet
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': window.Telegram?.WebApp?.initData || '',
        },
        body: JSON.stringify({
          agent_id: agent.id,
          pricing_type: agent.pricing_type,
          pricing_value: agent.pricing_value,
          pricing_currency: agent.pricing_currency,
        }),
      });

      if (!res.ok) throw new Error('Failed to create contract');

      haptic?.notificationOccurred('success');
      alert('Agent hired successfully! (Demo mode)');
    } catch (err) {
      haptic?.notificationOccurred('error');
      alert('Failed to hire agent. Please try again.');
    } finally {
      setHiring(false);
    }
  };

  if (loading) {
    return (
      <MiniAppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
        </div>
      </MiniAppShell>
    );
  }

  if (error || !agent) {
    return (
      <MiniAppShell>
        <div className="text-center py-12">
          <p className="text-red-400 text-lg">{error || 'Agent not found'}</p>
          <a href="/" className="text-amber-400 hover:text-amber-300 mt-4 inline-block">
            ← Back to Browse
          </a>
        </div>
      </MiniAppShell>
    );
  }

  const categoryIcon =
    agent.category === 'yield' ? '🌾' :
    agent.category === 'trading' ? '📈' :
    agent.category === 'defi' ? '🏦' :
    agent.category === 'monitoring' ? '👁️' : '📊';

  return (
    <MiniAppShell>
      {/* Back button */}
      <a href="/" className="text-amber-400 hover:text-amber-300 text-sm mb-4 inline-block">
        ← Back
      </a>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center text-2xl">
          {categoryIcon}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{agent.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-900/30 text-amber-400">
              {agent.category}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-amber-400">★</span>
              <span className="text-sm text-gray-300">{agent.avg_rating.toFixed(1)}</span>
            </div>
            <span className="text-xs text-gray-500">{agent.total_hires} hires</span>
          </div>
        </div>
      </div>

      {/* Pricing card */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Pricing</p>
            <p className="text-2xl font-bold text-white mt-1">
              {agent.pricing_type === 'free' ? 'Free' :
               agent.pricing_type === 'percentage' ? `${agent.pricing_value}%` :
               `$${agent.pricing_value}`}
              {agent.pricing_type === 'fixed' && (
                <span className="text-sm text-gray-500 font-normal">/mo</span>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Revenue</p>
            <p className="text-lg font-semibold text-green-400 mt-1">
              ${agent.total_revenue.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 mb-4">
        {(['about', 'reviews', 'terms'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'text-amber-400 border-b-2 border-amber-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'about' && (
        <div>
          <p className="text-gray-300 leading-relaxed">{agent.description}</p>
          {agent.subcategory && (
            <p className="text-sm text-gray-500 mt-3">
              Subcategory: {agent.subcategory}
            </p>
          )}
        </div>
      )}

      {activeTab === 'reviews' && (
        <div className="space-y-3">
          {ratings.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No reviews yet</p>
          ) : (
            ratings.map((rating) => (
              <div key={rating.id} className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-amber-400">{'★'.repeat(rating.score)}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(rating.created_at).toLocaleDateString()}
                  </span>
                </div>
                {rating.comment && (
                  <p className="text-sm text-gray-400">{rating.comment}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'terms' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Payment</p>
            <p className="text-sm text-gray-300">
              {agent.pricing_type === 'free' ? 'Free to use' :
               agent.pricing_type === 'percentage' ? `${agent.pricing_value}% of yield generated` :
               `$${agent.pricing_value} per month`}
            </p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Wallet</p>
            <p className="text-sm text-gray-300 font-mono">
              {agent.wallet_address.slice(0, 6)}...{agent.wallet_address.slice(-4)}
            </p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Network</p>
            <p className="text-sm text-gray-300">BNB Smart Chain</p>
          </div>
        </div>
      )}

      {/* Hire button (fallback if MainButton not available) */}
      {!mainButton && (
        <button
          onClick={handleHire}
          disabled={hiring || !isAuthenticated}
          className="w-full mt-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-black font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hiring ? 'Processing...' : !isAuthenticated ? 'Login to Hire' : `Hire Agent`}
        </button>
      )}
    </MiniAppShell>
  );
}
