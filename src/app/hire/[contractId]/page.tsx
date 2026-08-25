'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Download, ArrowLeft } from 'lucide-react';
import { useIdentity } from '@/hooks/useIdentity';
import { MiniAppShell } from '@/components/miniapp/MiniAppShell';
import type { AgentSignal } from '@/lib/market/signals';

interface ContractDetail {
  id: string;
  status: string;
  pricing_type: string;
  pricing_value: number;
  pricing_currency: string;
  payment_tx_hash: string | null;
  started_at: string | null;
  metadata: { output?: AgentSignal } | null;
}

interface AgentBrief {
  id: string;
  name: string;
  category: string;
}

/**
 * "Agent output" — what a buyer (or a judge hiring through the marketplace,
 * per the TermiX rubric: "TermiX will hire from your marketplace themselves
 * and see what comes back") lands on right after a successful hire. Replaces
 * the previous dead-end toast — see src/app/agent/[id]/page.tsx's handleHire.
 */
export default function HireResultPage() {
  const params = useParams();
  const { identity, isAuthenticated } = useIdentity();
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [agent, setAgent] = useState<AgentBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !identity) return;
    fetch(`/api/contracts/${params.contractId}`, { headers: identity.authHeader })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        setContract(data.contract);
        setAgent(data.agent);
      })
      .catch(() => setError('Could not load this contract'))
      .finally(() => setLoading(false));
  }, [params.contractId, identity, isAuthenticated]);

  const downloadJson = () => {
    if (!contract) return;
    const blob = new Blob([JSON.stringify(contract.metadata?.output ?? {}, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-output-${contract.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isAuthenticated) {
    return (
      <MiniAppShell>
        <div className="text-center py-12">
          <p className="text-gray-400 text-lg">
            Open this app in Telegram, or connect your wallet, to view this hire
          </p>
        </div>
      </MiniAppShell>
    );
  }

  if (loading) {
    return (
      <MiniAppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
        </div>
      </MiniAppShell>
    );
  }

  if (error || !contract) {
    return (
      <MiniAppShell>
        <div className="text-center py-12">
          <p className="text-red-400 text-lg mb-4">{error || 'Contract not found'}</p>
          <Link href="/" className="text-amber-400 hover:text-amber-300 text-sm">
            ← Back to marketplace
          </Link>
        </div>
      </MiniAppShell>
    );
  }

  const output = contract.metadata?.output;

  return (
    <MiniAppShell>
      <Link href="/" className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 text-sm mb-4">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
        Back
      </Link>

      <div className="flex items-center gap-2 mb-1">
        <CheckCircle2 className="h-6 w-6 text-emerald-400" strokeWidth={2} />
        <h1 className="text-2xl font-bold text-white">Agent hired</h1>
      </div>
      <p className="text-gray-400 mb-6">
        {agent?.name ?? 'Agent'} · Contract #{contract.id.slice(0, 8)}
      </p>

      {contract.payment_tx_hash && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 mb-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Payment / onchain record</p>
          <a
            href={`https://testnet.bscscan.com/tx/${contract.payment_tx_hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-amber-400 hover:text-amber-300 font-mono break-all"
          >
            {contract.payment_tx_hash} ↗
          </a>
        </div>
      )}

      <div className="rounded-xl border border-emerald-900/40 bg-emerald-900/10 p-4 mb-4">
        <p className="text-xs text-emerald-400 uppercase tracking-wider font-medium mb-2">Agent output</p>
        {output ? (
          <>
            <p className="text-white font-medium mb-1">{output.task}</p>
            <pre className="text-xs text-gray-300 bg-black/30 rounded-lg p-3 mt-2 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(output.result, null, 2)}
            </pre>
            <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
              <span>
                Source:{' '}
                {output.data_sources.map((src) => (
                  <a
                    key={src}
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-gray-300 underline mr-2"
                  >
                    {new URL(src).hostname}
                  </a>
                ))}
              </span>
              <span>
                {new Date(output.timestamp).toLocaleString()} · {output.elapsed_ms}ms
              </span>
            </div>
            <button
              onClick={downloadJson}
              className="mt-4 flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={2} />
              Download full output as JSON
            </button>
          </>
        ) : (
          <p className="text-sm text-gray-500">
            This agent doesn&apos;t produce a computed output (e.g. a free/manual listing), or the
            output couldn&apos;t be computed right now — the hire itself still succeeded.
          </p>
        )}
      </div>

      <Link
        href="/dashboard"
        className="block w-full rounded-xl border border-gray-800 py-3 text-center text-white font-medium hover:bg-gray-900/50 transition-colors"
      >
        View in My Agents
      </Link>
    </MiniAppShell>
  );
}
