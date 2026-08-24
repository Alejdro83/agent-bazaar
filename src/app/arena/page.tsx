'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Swords, Wand2, Loader2 } from 'lucide-react';
import { MiniAppShell } from '@/components/miniapp/MiniAppShell';
import { AgentSelector } from '@/components/arena/AgentSelector';
import { ArenaCompare } from '@/components/arena/ArenaCompare';

interface AgentOption {
  id: string;
  name: string;
  category: string;
}

interface ArenaResult {
  objective: string;
  agentA: { id: string; name: string; category: string; description: string; pricing_type: string; pricing_value: number; pricing_currency: string; avg_rating: number; total_hires: number; onchain_reputation: number | null; source: string; scores: { objective_fit: number; rating: number; track_record: number; category_safety: number; affordability: number }; winner_score: number };
  agentB: ArenaResult['agentA'];
  winner: 'A' | 'B';
  radar_axes: string[];
  note: string;
}

function ArenaPageInner() {
  const searchParams = useSearchParams();
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [objective, setObjective] = useState('');
  const [agentAId, setAgentAId] = useState(searchParams.get('agentA') || '');
  const [agentBId, setAgentBId] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState<ArenaResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/agents?limit=50')
      .then((res) => res.json())
      .then((data) => setAgents(data.agents.map((a: AgentOption) => ({ id: a.id, name: a.name, category: a.category }))))
      .catch(() => setError('Failed to load agent catalog'));
  }, []);

  const handleSuggest = useCallback(async () => {
    if (!objective.trim()) {
      setError('Describe your goal first');
      return;
    }
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch('/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: objective }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Suggestion failed');
      if (data.matches.length < 2) {
        setError('Not enough matching agents to suggest a pair — pick manually.');
        return;
      }
      setAgentAId(data.matches[0].id);
      setAgentBId(data.matches[1].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suggestion failed');
    } finally {
      setSuggesting(false);
    }
  }, [objective]);

  const handleCompare = useCallback(async () => {
    if (!objective.trim() || !agentAId || !agentBId) {
      setError('Fill in your goal and pick two agents');
      return;
    }
    setComparing(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/arena', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective, agentA_id: agentAId, agentB_id: agentBId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Comparison failed');
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setComparing(false);
    }
  }, [objective, agentAId, agentBId]);

  return (
    <MiniAppShell>
      <div className="mb-6 text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <Swords className="h-6 w-6 text-amber-400" strokeWidth={2} />
          <h1 className="text-2xl font-bold text-white">Agent Arena</h1>
        </div>
        <p className="text-sm text-gray-400">Put two agents head-to-head against your goal</p>
      </div>

      <div className="mb-4 rounded-xl border border-gray-800/60 bg-gray-900/20 p-3 text-xs text-gray-500">
        <span className="font-medium text-gray-400">How this works:</span> the match score comes
        from real data — how well each agent&apos;s own description fits your goal, its actual
        rating and hire history, and onchain reputation when available. &ldquo;Category
        safety&rdquo; on the radar is the one exception: a fixed risk profile per category, not
        an analysis of this specific agent — shown for context, but it never decides the winner.
      </div>

      <div className="mb-4 space-y-3 rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">Your goal</span>
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="e.g. I have $1000 in BNB and want to maximize yield this month"
            rows={2}
            className="w-full rounded-xl border border-gray-800 bg-gray-900/50 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-amber-500/50 focus:outline-none resize-none"
          />
        </label>

        <button
          onClick={handleSuggest}
          disabled={suggesting}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/30 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
        >
          {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" strokeWidth={2} />}
          Suggest best match
        </button>

        <div className="grid grid-cols-2 gap-3">
          <AgentSelector label="Agent A" agents={agents} value={agentAId} onChange={setAgentAId} disabledId={agentBId} />
          <AgentSelector label="Agent B" agents={agents} value={agentBId} onChange={setAgentBId} disabledId={agentAId} />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={handleCompare}
          disabled={comparing}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 font-semibold text-black disabled:opacity-50"
        >
          {comparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" strokeWidth={2.25} />}
          {comparing ? 'Comparing…' : 'Battle!'}
        </button>
      </div>

      {result && <ArenaCompare result={result} />}
    </MiniAppShell>
  );
}

export default function ArenaPage() {
  return (
    <Suspense fallback={null}>
      <ArenaPageInner />
    </Suspense>
  );
}
