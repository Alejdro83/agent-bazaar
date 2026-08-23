'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Star, Plus, Wallet } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useIdentity } from '@/hooks/useIdentity';
import { MiniAppShell } from '@/components/miniapp/MiniAppShell';

interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
  pricing_type: string;
  pricing_value: number;
  status: string;
  total_hires: number;
  avg_rating: number;
  total_revenue: number;
  created_at: string;
}

interface Contract {
  id: string;
  agent_id: string;
  buyer_id: string;
  status: string;
  pricing_value: number;
  pricing_currency: string;
  started_at: string;
  expires_at: string | null;
  agent_name?: string;
}

interface DashboardStats {
  totalRevenue: number;
  activeContracts: number;
  totalAgents: number;
  avgRating: number;
}

export default function DashboardPage() {
  const { isLoading: telegramLoading } = useTelegram();
  const { identity, isAuthenticated } = useIdentity();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    activeContracts: 0,
    totalAgents: 0,
    avgRating: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'contracts'>('overview');

  const fetchDashboard = useCallback(async () => {
    if (!identity) return;
    setError(null);

    try {
      const [agentsRes, contractsRes] = await Promise.all([
        fetch('/api/agents?seller=me', { headers: identity.authHeader }),
        fetch('/api/contracts?role=seller', { headers: identity.authHeader }),
      ]);

      if (!agentsRes.ok || !contractsRes.ok) {
        throw new Error('Failed to load dashboard data');
      }

      const agentsData = await agentsRes.json();
      const contractsData = await contractsRes.json();
      const fetchedAgents: Agent[] = agentsData.agents;
      const fetchedContracts: Contract[] = contractsData.contracts;

      setAgents(fetchedAgents);
      setContracts(fetchedContracts);

      const totalRevenue = fetchedAgents.reduce((sum, a) => sum + a.total_revenue, 0);
      const activeContracts = fetchedContracts.filter((c) => c.status === 'active').length;
      const avgRating =
        fetchedAgents.length > 0
          ? fetchedAgents.reduce((sum, a) => sum + a.avg_rating, 0) / fetchedAgents.length
          : 0;

      setStats({
        totalRevenue,
        activeContracts,
        totalAgents: fetchedAgents.length,
        avgRating,
      });
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [identity]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    fetchDashboard();
  }, [isAuthenticated, fetchDashboard]);

  if (telegramLoading || loading) {
    return (
      <MiniAppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
        </div>
      </MiniAppShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <MiniAppShell>
        <div className="text-center py-12">
          <p className="text-gray-400 text-lg mb-4">
            Open this app in Telegram, or connect your wallet, to access your dashboard
          </p>
        </div>
      </MiniAppShell>
    );
  }

  if (error) {
    return (
      <MiniAppShell>
        <div className="text-center py-12">
          <p className="text-red-400 text-lg mb-4">{error}</p>
          <button
            onClick={() => { setLoading(true); fetchDashboard(); }}
            className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-2 text-black font-semibold"
          >
            Retry
          </button>
        </div>
      </MiniAppShell>
    );
  }

  return (
    <MiniAppShell>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Seller Dashboard</h1>
        <p className="text-gray-400">
          Welcome back, {identity?.displayName}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Revenue</p>
          <p className="text-2xl font-bold text-green-400 mt-1">
            ${stats.totalRevenue.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Active Hires</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">
            {stats.activeContracts}
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Agents</p>
          <p className="text-2xl font-bold text-white mt-1">
            {stats.totalAgents}
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Avg Rating</p>
          <p className="flex items-center gap-1 text-2xl font-bold text-amber-400 mt-1">
            <Star className="h-5 w-5 fill-amber-400" />
            {stats.avgRating.toFixed(1)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 mb-4">
        {(['overview', 'agents', 'contracts'] as const).map((tab) => (
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
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Recent activity */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-3">Recent Activity</h3>
            {contracts.length === 0 ? (
              <p className="text-gray-600 text-sm">No activity yet</p>
            ) : (
              <div className="space-y-2">
                {contracts.slice(0, 5).map((contract) => (
                  <div
                    key={contract.id}
                    className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/30 p-3"
                  >
                    <div>
                      <p className="text-sm text-white">
                        Contract #{contract.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(contract.started_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-green-400">
                        ${contract.pricing_value}
                      </p>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          contract.status === 'active'
                            ? 'bg-green-900/30 text-green-400'
                            : 'bg-gray-900/30 text-gray-400'
                        }`}
                      >
                        {contract.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/list"
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-center"
              >
                <Plus className="h-5 w-5 mx-auto text-amber-400" strokeWidth={2.25} />
                <p className="text-sm text-amber-400 mt-1">List New Agent</p>
              </Link>
              <button
                disabled
                title="Coming soon"
                className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-center opacity-50 cursor-not-allowed"
              >
                <Wallet className="h-5 w-5 mx-auto text-gray-500" strokeWidth={2} />
                <p className="text-sm text-gray-300 mt-1">Withdraw</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'agents' && (
        <div className="space-y-3">
          {agents.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">You haven&apos;t listed any agents yet</p>
              <Link
                href="/list"
                className="inline-block rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-2 text-black font-semibold"
              >
                List Your First Agent
              </Link>
            </div>
          ) : (
            agents.map((agent) => (
              <div
                key={agent.id}
                className="rounded-xl border border-gray-800 bg-gray-900/50 p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-white">{agent.name}</h3>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-900/30 text-amber-400">
                      {agent.category}
                    </span>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      agent.status === 'active'
                        ? 'bg-green-900/30 text-green-400'
                        : 'bg-gray-900/30 text-gray-400'
                    }`}
                  >
                    {agent.status}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-xs text-gray-500">Hires</p>
                      <p className="text-sm font-medium text-white">{agent.total_hires}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Rating</p>
                      <p className="flex items-center gap-1 text-sm font-medium text-amber-400">
                        <Star className="h-3.5 w-3.5 fill-amber-400" />
                        {agent.avg_rating.toFixed(1)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Revenue</p>
                      <p className="text-sm font-medium text-green-400">
                        ${agent.total_revenue.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/agent/${agent.id}`}
                    className="text-xs text-amber-400 hover:text-amber-300"
                  >
                    View →
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'contracts' && (
        <div className="space-y-3">
          {contracts.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No contracts yet</p>
          ) : (
            contracts.map((contract) => (
              <div
                key={contract.id}
                className="rounded-xl border border-gray-800 bg-gray-900/50 p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-white">
                      Contract #{contract.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Started {new Date(contract.started_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      contract.status === 'active'
                        ? 'bg-green-900/30 text-green-400'
                        : contract.status === 'completed'
                        ? 'bg-blue-900/30 text-blue-400'
                        : 'bg-gray-900/30 text-gray-400'
                    }`}
                  >
                    {contract.status}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-400">
                    Buyer: {contract.buyer_id.slice(0, 8)}...
                  </p>
                  <p className="text-sm font-medium text-green-400">
                    ${contract.pricing_value} {contract.pricing_currency}
                  </p>
                </div>
                {contract.expires_at && (
                  <p className="text-xs text-gray-600 mt-2">
                    Expires: {new Date(contract.expires_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </MiniAppShell>
  );
}
