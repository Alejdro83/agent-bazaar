'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Download, ArrowLeft, ShieldAlert, ShieldCheck, ShieldOff, ShieldQuestion } from 'lucide-react';
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

/** Mirrors AltanaSessionSummary from src/lib/altana/session-envelope.ts — the safe, client-facing subset only (never the raw serialized session). */
interface AltanaSessionSummary {
  status: 'active' | 'expired' | 'revoked';
  callAllowlist: string[];
  nativeSpendCapWei: string;
  nativeSpendCapBnb: string;
  expiry: number;
  expiryIso: string;
  sessionPublicKey: string;
  sessionWalletAddress: string;
  revokedAt: string | null;
  revokeTxHash: string | null;
}

/** "Xm Ys" until `expiry` (unix seconds), or "expired" once past. */
function formatCountdown(expirySeconds: number, nowMs: number): string {
  const remainingSeconds = expirySeconds - Math.floor(nowMs / 1000);
  if (remainingSeconds <= 0) return 'expired';
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
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
  const [session, setSession] = useState<AltanaSessionSummary | null | undefined>(undefined);
  const [revoking, setRevoking] = useState(false);
  const [revokeMessage, setRevokeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchSession = useCallback(() => {
    if (!identity) return;
    fetch(`/api/altana/session/${params.contractId}`, { headers: identity.authHeader })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: { session: AltanaSessionSummary | null }) => setSession(data.session))
      .catch(() => setSession(null));
  }, [params.contractId, identity]);

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
    // Every contract is checked — harmless (`{ session: null }`) for the
    // vast majority that never went through the Altana grant flow.
    fetchSession();
  }, [params.contractId, identity, isAuthenticated, fetchSession]);

  // Live countdown tick — only while there's an active session worth
  // counting down (no point re-rendering every second for every visit).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (session?.status !== 'active') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session?.status]);

  const handleRevoke = async () => {
    if (!identity || !contract) return;
    setRevoking(true);
    setRevokeMessage(null);
    try {
      const res = await fetch('/api/altana/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...identity.authHeader },
        body: JSON.stringify({ contract_id: contract.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke session');
      setRevokeMessage({ type: 'success', text: 'Session revoked — effective immediately onchain.' });
      fetchSession();
    } catch (err) {
      setRevokeMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to revoke session' });
    } finally {
      setRevoking(false);
    }
  };

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

      {session && (
        <div className="rounded-xl border border-sky-900/40 bg-sky-900/10 p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-sky-400 uppercase tracking-wider font-medium">Altana session</p>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                session.status === 'active'
                  ? 'bg-emerald-900/30 text-emerald-400'
                  : session.status === 'expired'
                  ? 'bg-gray-800 text-gray-400'
                  : 'bg-red-900/30 text-red-400'
              }`}
            >
              {session.status === 'active' && <ShieldCheck className="h-3 w-3" strokeWidth={2} />}
              {session.status === 'expired' && <ShieldQuestion className="h-3 w-3" strokeWidth={2} />}
              {session.status === 'revoked' && <ShieldOff className="h-3 w-3" strokeWidth={2} />}
              {session.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Spend cap</p>
              <p className="text-white font-mono">{session.nativeSpendCapBnb} tBNB</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                {session.status === 'active' ? 'Expires in' : 'Expiry'}
              </p>
              <p className="text-white font-mono">
                {session.status === 'active' ? formatCountdown(session.expiry, now) : new Date(session.expiryIso).toLocaleString()}
              </p>
            </div>
          </div>

          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Call allowlist</p>
          {session.callAllowlist.map((addr) => (
            <a
              key={addr}
              href={`https://testnet.bscscan.com/address/${addr}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-amber-400 hover:text-amber-300 font-mono break-all mb-2"
            >
              {addr} ↗
            </a>
          ))}

          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Session key (registered in KeyStore)</p>
          <p className="text-sm text-gray-300 font-mono break-all mb-1">{session.sessionPublicKey}</p>
          <a
            href={`https://testnet.altana.network/account/${session.sessionWalletAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-sky-400 hover:text-sky-300 underline mb-3"
          >
            Verify in Altana&apos;s Keystore Explorer ↗
          </a>

          {session.status === 'revoked' ? (
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <ShieldOff className="h-3 w-3" strokeWidth={2} />
              Revoked {session.revokedAt && new Date(session.revokedAt).toLocaleString()}
              {session.revokeTxHash && (
                <>
                  {' · '}
                  <a
                    href={`https://testnet.bscscan.com/tx/${session.revokeTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 hover:text-amber-300 underline"
                  >
                    view tx ↗
                  </a>
                </>
              )}
            </p>
          ) : (
            <button
              onClick={handleRevoke}
              disabled={revoking || session.status !== 'active'}
              className="w-full rounded-xl border border-red-800/40 bg-red-900/10 py-2.5 text-red-400 font-semibold hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              <ShieldAlert className="h-4 w-4" strokeWidth={2} />
              {revoking ? 'Revoking…' : 'Revoke session'}
            </button>
          )}

          {revokeMessage && (
            <p className={`text-xs mt-2 ${revokeMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {revokeMessage.text}
            </p>
          )}
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
