'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSendTransaction } from 'wagmi';
import { parseEther } from 'viem';
import { ArrowLeft, Bot, Star, TrendingUp, RefreshCw } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useIdentity } from '@/hooks/useIdentity';
import { MiniAppShell } from '@/components/miniapp/MiniAppShell';
import { CATEGORY_ICONS } from '@/lib/categories';
import { summarizeSignal } from '@/lib/market/format';
import type { AgentSignal } from '@/lib/market/signals';
import { TrackRecordCard } from '@/components/agent/TrackRecordCard';

// Trivial on testnet, but a real signed transfer — matches MIN_PAYMENT_WEI
// in src/app/api/contracts/route.ts, which verifies this amount onchain.
const PAYMENT_AMOUNT_BNB = '0.0001';

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
  source: 'user' | '8004scan';
  chain_id: number | null;
  is_testnet: boolean | null;
  onchain_reputation: number | null;
  external_agent_id: string | null;
  erc8004_id: string | null;
  erc8004_data: {
    star_count?: number;
    total_feedbacks?: number;
    is_verified?: boolean;
    supported_protocols?: string[];
    x402_supported?: boolean;
  } | null;
  onchain_tx_hash: string | null;
  total_revenue: number;
  created_at: string;
  metadata: {
    track_record?: Record<string, unknown>;
    /** Marks agents (currently just AltanaGridBot) hireable through the dedicated Altana session-grant flow below, rather than the normal Hire button — and excluded from the Live Signal card, since a session grant/revoke IS its real output, not a market read. */
    altana_session_agent?: boolean;
    /** Marks agents (currently just X402PayBot) hireable through the dedicated x402 settlement flow below, rather than the normal Hire button — the real, self-hosted x402/B402 settlement IS its output, not a market read. */
    payment_rail?: string;
  } | null;
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
  const router = useRouter();
  const { haptic, mainButton } = useTelegram();
  const { identity, isAuthenticated } = useIdentity();
  const { sendTransactionAsync } = useSendTransaction();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'about' | 'reviews' | 'terms'>('about');
  const [hiring, setHiring] = useState(false);
  const [hireMessage, setHireMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [ratingScore, setRatingScore] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingMessage, setRatingMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [signal, setSignal] = useState<AgentSignal | null>(null);
  const [signalError, setSignalError] = useState(false);
  const [grantingSession, setGrantingSession] = useState(false);
  const [grantMessage, setGrantMessage] = useState<
    { type: 'success' | 'error'; text: string; contractId?: string } | null
  >(null);
  const [x402Hiring, setX402Hiring] = useState(false);
  const [x402Message, setX402Message] = useState<
    { type: 'success' | 'error'; text: string; contractId?: string } | null
  >(null);

  const handleSubmitRating = async () => {
    if (!agent || !identity) return;
    setSubmittingRating(true);
    setRatingMessage(null);

    try {
      const res = await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...identity.authHeader },
        body: JSON.stringify({ agent_id: agent.id, score: ratingScore, comment: ratingComment || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit rating');

      haptic?.notificationOccurred('success');
      setRatingMessage({ type: 'success', text: 'Thanks for the review!' });
      setRatings((prev) => [data.rating, ...prev]);
      setRatingComment('');
    } catch (err) {
      haptic?.notificationOccurred('error');
      setRatingMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to submit rating' });
    } finally {
      setSubmittingRating(false);
    }
  };

  useEffect(() => {
    const fetchAgent = async () => {
      try {
        const res = await fetch(`/api/agents/${params.id}`);
        if (!res.ok) throw new Error('Agent not found');
        const data = await res.json();
        setAgent(data.agent);
        // AltanaGridBot's and X402PayBot's real value is the
        // session/settlement mechanism, not a market read —
        // computeAgentSignal's grid_trading case would fall through to the
        // generic ATR-grid branch for either (no matching strategy) and
        // show a misleading number, so both are excluded here rather than
        // wired into that switch case.
        if (
          data.agent.source === 'user' &&
          !data.agent.metadata?.altana_session_agent &&
          data.agent.metadata?.payment_rail !== 'x402'
        ) {
          fetch(`/api/market/signal?agent_id=${data.agent.id}`)
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then((d: { signal: AgentSignal }) => setSignal(d.signal))
            .catch(() => setSignalError(true));
        }
        setRatings(data.ratings);
      } catch (err) {
        setError('Agent not found');
      } finally {
        setLoading(false);
      }
    };
    fetchAgent();
  }, [params.id]);

  const handleHire = useCallback(async () => {
    if (!agent || !identity) return;

    haptic?.impactOccurred('medium');
    setHiring(true);
    setHireMessage(null);

    try {
      // Paid agent + wallet identity: a real signed transfer to the seller's
      // wallet is required before the contract exists — see
      // src/app/api/contracts/route.ts's verifyPayment. Free agents and
      // Telegram-identified buyers skip straight to the API call.
      let paymentTxHash: string | undefined;
      if (agent.pricing_type !== 'free' && identity.type === 'wallet') {
        try {
          paymentTxHash = await sendTransactionAsync({
            to: agent.wallet_address as `0x${string}`,
            value: parseEther(PAYMENT_AMOUNT_BNB),
          });
        } catch (txError) {
          throw new Error(
            txError instanceof Error && txError.message.includes('insufficient funds')
              ? 'Insufficient testnet BNB — get some free from the BNB Chain faucet and try again'
              : 'Payment was cancelled or failed'
          );
        }
      }

      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...identity.authHeader,
        },
        body: JSON.stringify({
          agent_id: agent.id,
          pricing_type: agent.pricing_type,
          pricing_value: agent.pricing_value,
          pricing_currency: agent.pricing_currency,
          payment_tx_hash: paymentTxHash,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to create contract');

      haptic?.notificationOccurred('success');
      // Take the buyer straight to the agent's real output instead of
      // leaving them on a toast with nothing to look at — see src/app/hire/[contractId]/page.tsx.
      router.push(`/hire/${data.contract.id}`);
    } catch (err) {
      haptic?.notificationOccurred('error');
      setHireMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to hire agent' });
    } finally {
      setHiring(false);
    }
  }, [agent, identity, haptic, sendTransactionAsync, router]);

  // Dedicated, additive flow for the one agent marked
  // `metadata.altana_session_agent` (AltanaGridBot) — deliberately separate
  // from handleHire above rather than a branch inside it, so the normal
  // Hire button's behavior (and every other agent's) is untouched. Grants a
  // real, KeyStore-registered Altana session tied to a real contract — see
  // POST /api/altana/grant.
  const handleGrantAltanaSession = useCallback(async () => {
    if (!agent || !identity) return;

    haptic?.impactOccurred('medium');
    setGrantingSession(true);
    setGrantMessage(null);

    try {
      const res = await fetch('/api/altana/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...identity.authHeader },
        body: JSON.stringify({ agent_id: agent.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        // A funding-gap failure still returns a real contract_id (the hire
        // itself succeeded) — surface the specific reason, not a generic
        // failure, and let the buyer still go look at the hire if they want.
        throw Object.assign(new Error(data.error || 'Failed to grant Altana session'), {
          contractId: data.contract_id as string | undefined,
        });
      }

      haptic?.notificationOccurred('success');
      router.push(`/hire/${data.contract_id}`);
    } catch (err) {
      haptic?.notificationOccurred('error');
      const message = err instanceof Error ? err.message : 'Failed to grant Altana session';
      const contractId = err instanceof Error ? (err as Error & { contractId?: string }).contractId : undefined;
      setGrantMessage({ type: 'error', text: message, contractId });
    } finally {
      setGrantingSession(false);
    }
  }, [agent, identity, haptic, router]);

  // Dedicated x402/B402 settlement flow — this IS X402PayBot's hire flow
  // (the normal Hire button/MainButton are excluded for this agent below).
  // Real, gasless, self-hosted settlement: see POST /api/contracts/x402.
  const handleX402Hire = useCallback(async () => {
    if (!agent || !identity) return;

    haptic?.impactOccurred('medium');
    setX402Hiring(true);
    setX402Message(null);

    try {
      const res = await fetch('/api/contracts/x402', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...identity.authHeader },
        body: JSON.stringify({ agentId: agent.id }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'x402 settlement failed');

      haptic?.notificationOccurred('success');
      router.push(`/hire/${data.contract.id}`);
    } catch (err) {
      haptic?.notificationOccurred('error');
      setX402Message({ type: 'error', text: err instanceof Error ? err.message : 'x402 settlement failed' });
    } finally {
      setX402Hiring(false);
    }
  }, [agent, identity, haptic, router]);

  // Setup Main Button for hire. handleHire is a ref so the onClick/offClick
  // pair below always target the SAME function identity — registering a new
  // closure each render without a matching offClick was leaking handlers
  // (each stale one still fired), causing duplicate contracts per click.
  const handleHireRef = useRef(handleHire);
  handleHireRef.current = handleHire;

  useEffect(() => {
    // Same reasoning as the fallback web Hire button below: AltanaGridBot's
    // dedicated grant flow and X402PayBot's dedicated settlement flow both
    // hire internally, so they're excluded from the generic Telegram
    // MainButton hire path too.
    if (
      !agent ||
      !mainButton ||
      agent.source !== 'user' ||
      agent.metadata?.altana_session_agent ||
      agent.metadata?.payment_rail === 'x402'
    )
      return;

    const onClick = () => handleHireRef.current();

    mainButton.text = `Hire — ${agent.pricing_type === 'free' ? 'Free' : agent.pricing_type === 'percentage' ? `${agent.pricing_value}% yield` : `$${agent.pricing_value}/mo`}`;
    mainButton.show();
    mainButton.onClick(onClick);

    return () => {
      mainButton.offClick(onClick);
      mainButton.hide();
    };
  }, [agent, mainButton]);

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
          <Link href="/" className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 mt-4">
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
            Back to Browse
          </Link>
        </div>
      </MiniAppShell>
    );
  }

  const CategoryIcon = CATEGORY_ICONS[agent.category] ?? Bot;

  return (
    <MiniAppShell>
      {/* Back button */}
      <Link href="/" className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 text-sm mb-4">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
        Back
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
          <CategoryIcon className="h-7 w-7 text-amber-400" strokeWidth={2} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{agent.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-900/30 text-amber-400">
              {agent.category}
            </span>
            <div className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
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
              {agent.metadata?.payment_rail === 'x402' ? `${agent.pricing_value} ${agent.pricing_currency}` :
               agent.pricing_type === 'free' ? 'Free' :
               agent.pricing_type === 'percentage' ? `${agent.pricing_value}%` :
               `$${agent.pricing_value}`}
              {agent.pricing_type === 'fixed' && agent.metadata?.payment_rail !== 'x402' && (
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

      {/* Live signal — real market data combined with this agent's own strategy, see src/lib/market/signals.ts. Excluded for AltanaGridBot and X402PayBot (see the fetch guard above) — never rendered, so it can't get stuck on "Computing…" forever. */}
      {agent.source === 'user' && !agent.metadata?.altana_session_agent && agent.metadata?.payment_rail !== 'x402' && (
        <div className="rounded-xl border border-emerald-900/40 bg-emerald-900/10 p-4 mb-6">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" strokeWidth={2} />
            <p className="text-xs text-emerald-400 uppercase tracking-wider font-medium">Live signal</p>
          </div>
          {signal ? (
            <>
              <p className="text-white font-medium mb-1">{summarizeSignal(agent.category, signal)}</p>
              <p className="text-xs text-gray-500">{signal.task}</p>
              <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
                <span>
                  Source:{' '}
                  <a
                    href={signal.data_sources[0]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-gray-300 underline"
                  >
                    {new URL(signal.data_sources[0]).hostname}
                  </a>
                </span>
                <span className="flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" strokeWidth={2} />
                  {new Date(signal.timestamp).toLocaleTimeString()} · {signal.elapsed_ms}ms
                </span>
              </div>
            </>
          ) : signalError ? (
            <p className="text-sm text-gray-500">Live signal temporarily unavailable — try again shortly.</p>
          ) : (
            <p className="text-sm text-gray-500">Computing from live market data…</p>
          )}
        </div>
      )}

      {/* Track record — real historical backtest, explicitly not live capital, see src/lib/market/backtest.ts */}
      {agent.source === 'user' && agent.metadata?.track_record && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 mb-6">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">
            Track record — backtest, not live capital
          </p>
          <TrackRecordCard trackRecord={agent.metadata.track_record} />
          <p className="text-xs text-gray-600 mt-3">
            {String(agent.metadata.track_record.window)} · real historical data, reproducible
          </p>
        </div>
      )}

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
                  <span className="flex gap-0.5">
                    {Array.from({ length: rating.score }).map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </span>
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

          {agent.source === 'user' && isAuthenticated && (
            <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3 mt-4">
              <p className="text-sm font-medium text-white mb-2">Rate this agent</p>
              <div className="flex gap-1 mb-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRatingScore(n)}
                    aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    className={n <= ratingScore ? 'text-amber-400' : 'text-gray-700'}
                  >
                    <Star className="h-5 w-5" fill="currentColor" />
                  </button>
                ))}
              </div>
              <textarea
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                placeholder="Optional comment"
                rows={2}
                className="w-full rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-amber-500/50 focus:outline-none resize-none mb-2"
              />
              <button
                onClick={handleSubmitRating}
                disabled={submittingRating}
                className="w-full py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-black text-sm font-semibold disabled:opacity-50"
              >
                {submittingRating ? 'Submitting...' : 'Submit review'}
              </button>
              {ratingMessage && (
                <p className={`text-xs mt-2 ${ratingMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                  {ratingMessage.text}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'terms' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Payment</p>
            <p className="text-sm text-gray-300">
              {agent.metadata?.payment_rail === 'x402' ? `${agent.pricing_value} ${agent.pricing_currency}, settled per hire via x402 (gasless)` :
               agent.pricing_type === 'free' ? 'Free to use' :
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
            <p className="text-sm text-gray-300">
              BNB Smart Chain {agent.chain_id ? (agent.is_testnet ? '(Testnet)' : '(Mainnet)') : ''}
            </p>
          </div>
          {agent.source === '8004scan' && (
            <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Onchain Reputation (8004scan)</p>
              <p className="text-sm text-gray-300">
                Average score: {agent.onchain_reputation !== null ? agent.onchain_reputation.toFixed(2) : '—'}
              </p>
              {agent.erc8004_data && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                  {!!agent.erc8004_data.star_count && <span>★ {agent.erc8004_data.star_count} stars</span>}
                  {!!agent.erc8004_data.total_feedbacks && (
                    <span>{agent.erc8004_data.total_feedbacks} onchain feedbacks</span>
                  )}
                  {agent.erc8004_data.is_verified && <span className="text-blue-400">✓ Verified identity</span>}
                  {agent.erc8004_data.x402_supported && <span>x402 payments supported</span>}
                  {!!agent.erc8004_data.supported_protocols?.length && (
                    <span>Protocols: {agent.erc8004_data.supported_protocols.join(', ')}</span>
                  )}
                </div>
              )}
            </div>
          )}
          {agent.source === 'user' && (
            <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3 col-span-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">ERC-8004 Identity</p>
              {agent.onchain_tx_hash ? (
                <a
                  href={`https://testnet.bscscan.com/tx/${agent.onchain_tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-amber-400 hover:text-amber-300 font-mono"
                >
                  Agent #{agent.erc8004_id} — view registration tx ↗
                </a>
              ) : (
                <p className="text-sm text-gray-500">Not registered onchain</p>
              )}
            </div>
          )}
        </div>
      )}

      {hireMessage && (
        <div
          className={`mt-4 p-3 rounded-xl border text-sm ${
            hireMessage.type === 'success'
              ? 'border-green-800/30 bg-green-900/10 text-green-400'
              : 'border-red-800/30 bg-red-900/10 text-red-400'
          }`}
        >
          {hireMessage.text}
        </div>
      )}

      {/* Dedicated Altana session grant — this IS AltanaGridBot's hire flow
          (the normal Hire button/MainButton are excluded for this agent
          above, so this is the only way to hire it). Real onchain session:
          call allowlist, spend cap, expiry, registered in Altana's KeyStore
          registry — see /api/altana/grant. */}
      {agent.source === 'user' && agent.metadata?.altana_session_agent && (
        <div className="mt-4 rounded-xl border border-sky-900/40 bg-sky-900/10 p-4">
          <p className="text-xs text-sky-400 uppercase tracking-wider font-medium mb-2">
            Altana session (BSC testnet)
          </p>
          <p className="text-sm text-gray-400 mb-3">
            Grants a real, self-custodial Altana session scoped to a call allowlist, a native BNB
            spend cap, and an expiry — registered onchain in the public KeyStore registry. You can
            view the exact permissions and revoke it at any time from the hire page.
          </p>
          <button
            onClick={handleGrantAltanaSession}
            disabled={grantingSession || !isAuthenticated}
            className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-blue-500 py-3 text-black font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {grantingSession
              ? 'Granting session…'
              : !isAuthenticated
              ? 'Connect wallet to grant a session'
              : 'Grant Altana session'}
          </button>
          {grantMessage && (
            <div
              className={`mt-3 p-3 rounded-xl border text-sm ${
                grantMessage.type === 'success'
                  ? 'border-green-800/30 bg-green-900/10 text-green-400'
                  : 'border-red-800/30 bg-red-900/10 text-red-400'
              }`}
            >
              <p>{grantMessage.text}</p>
              {grantMessage.contractId && (
                <Link
                  href={`/hire/${grantMessage.contractId}`}
                  className="inline-block mt-1 text-amber-400 hover:text-amber-300 underline"
                >
                  View the hire anyway →
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dedicated x402/B402 settlement — this IS X402PayBot's hire flow
          (the normal Hire button/MainButton are excluded for this agent
          above, so this is the only way to hire it). Real settlement:
          self-hosted merchant, EIP-3009 authorization, gasless for the
          buyer — see /api/contracts/x402. */}
      {agent.source === 'user' && agent.metadata?.payment_rail === 'x402' && (
        <div className="mt-4 rounded-xl border border-emerald-900/40 bg-emerald-900/10 p-4">
          <p className="text-xs text-emerald-400 uppercase tracking-wider font-medium mb-2">
            x402 payment (BSC testnet)
          </p>
          <p className="text-sm text-gray-400 mb-3">
            Settles a real, gasless x402/B402 payment — an EIP-3009 authorization verified and
            broadcast on-chain by a self-hosted facilitator (no third-party facilitator
            dependency). The resulting settlement transaction is the real deliverable, shown on
            the hire page and verifiable on BscScan.
          </p>
          <button
            onClick={handleX402Hire}
            disabled={x402Hiring || !isAuthenticated}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-black font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {x402Hiring
              ? 'Settling payment…'
              : !isAuthenticated
              ? 'Connect to hire'
              : 'Pay via x402 (0.1 U, gasless)'}
          </button>
          {x402Message && (
            <div
              className={`mt-3 p-3 rounded-xl border text-sm ${
                x402Message.type === 'success'
                  ? 'border-green-800/30 bg-green-900/10 text-green-400'
                  : 'border-red-800/30 bg-red-900/10 text-red-400'
              }`}
            >
              <p>{x402Message.text}</p>
            </div>
          )}
        </div>
      )}

      {agent.source === '8004scan' ? (
        <a
          href={`https://8004scan.io/agents/${agent.is_testnet ? 'bsc-testnet' : 'bsc'}/${agent.external_agent_id?.split(':').pop()}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full mt-6 rounded-xl border border-gray-700 py-3 text-center text-white font-semibold hover:bg-gray-900/50 transition-colors"
        >
          View on 8004scan ↗
        </a>
      ) : (
        // AltanaGridBot's dedicated "Grant Altana session" button and
        // X402PayBot's dedicated "Pay via x402" button above already hire
        // internally — showing the normal Hire button too would let
        // someone create a contract for either without the payment
        // actually settling the way its panel describes.
        !agent.metadata?.altana_session_agent &&
        agent.metadata?.payment_rail !== 'x402' &&
        !mainButton && (
          <button
            onClick={handleHire}
            disabled={hiring || !isAuthenticated}
            className="w-full mt-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-black font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {hiring
              ? (identity?.type === 'wallet' && agent.pricing_type !== 'free' ? 'Confirm in wallet…' : 'Processing...')
              : !isAuthenticated
              ? 'Connect wallet to hire'
              : agent.pricing_type !== 'free' && identity?.type === 'wallet'
              ? `Pay ${PAYMENT_AMOUNT_BNB} tBNB & Hire`
              : 'Hire Agent'}
          </button>
        )
      )}
    </MiniAppShell>
  );
}
