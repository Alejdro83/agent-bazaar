'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSendTransaction } from 'wagmi';
import { parseEther } from 'viem';
import { ArrowLeft, Bot, Star } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useIdentity } from '@/hooks/useIdentity';
import { MiniAppShell } from '@/components/miniapp/MiniAppShell';
import { CATEGORY_ICONS } from '@/lib/categories';

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
  onchain_tx_hash: string | null;
  total_revenue: number;
  created_at: string;
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
      setHireMessage({
        type: 'success',
        text: data.payment?.kind === 'buyer_payment'
          ? `Paid and hired! Tx: ${data.payment.tx_hash.slice(0, 10)}…`
          : data.payment?.tx_hash
          ? `Agent hired! Onchain record: ${data.payment.tx_hash.slice(0, 10)}…`
          : 'Agent hired!',
      });
    } catch (err) {
      haptic?.notificationOccurred('error');
      setHireMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to hire agent' });
    } finally {
      setHiring(false);
    }
  }, [agent, identity, haptic, sendTransactionAsync]);

  // Setup Main Button for hire. handleHire is a ref so the onClick/offClick
  // pair below always target the SAME function identity — registering a new
  // closure each render without a matching offClick was leaking handlers
  // (each stale one still fired), causing duplicate contracts per click.
  const handleHireRef = useRef(handleHire);
  handleHireRef.current = handleHire;

  useEffect(() => {
    if (!agent || !mainButton || agent.source !== 'user') return;

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
            <p className="text-sm text-gray-300">
              BNB Smart Chain {agent.chain_id ? (agent.is_testnet ? '(Testnet)' : '(Mainnet)') : ''}
            </p>
          </div>
          {agent.source === '8004scan' && (
            <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Onchain Reputation</p>
              <p className="text-sm text-gray-300">
                {agent.onchain_reputation !== null ? agent.onchain_reputation.toFixed(2) : '—'}
              </p>
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

      {agent.source === '8004scan' ? (
        <a
          href={`https://8004scan.io/agents/${agent.external_agent_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full mt-6 rounded-xl border border-gray-700 py-3 text-center text-white font-semibold hover:bg-gray-900/50 transition-colors"
        >
          View on 8004scan ↗
        </a>
      ) : (
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
