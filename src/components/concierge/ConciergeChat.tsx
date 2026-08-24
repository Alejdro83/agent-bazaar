'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bot, X, Send, Loader2, Star, Swords } from 'lucide-react';
import { CATEGORY_ICONS } from '@/lib/categories';

interface Match {
  id: string;
  name: string;
  description: string;
  category: string;
  pricing_type: string;
  pricing_value: number;
  pricing_currency: string;
  total_hires: number;
  avg_rating: number;
  source: string;
  match_reason: 'semantic' | 'keyword';
  similarity: number | null;
}

function formatPricing(type: string, value: number, currency: string): string {
  if (type === 'free') return 'Free';
  if (type === 'percentage') return `${value}% of yield`;
  return `${value} ${currency}/mo`;
}

export function ConciergeChat() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const text = message.trim();
    if (!text || loading) return;

    setLoading(true);
    setError(null);
    setMatches(null);

    try {
      const res = await fetch('/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');

      setMatches(data.matches);
      setUsedFallback(data.fallback);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close Concierge' : 'Open Concierge'}
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-900/30 transition-transform hover:scale-105 active:scale-95"
      >
        {open ? (
          <X className="h-6 w-6 text-gray-950" strokeWidth={2.5} />
        ) : (
          <Bot className="h-6 w-6 text-gray-950" strokeWidth={2.25} />
        )}
      </button>

      {open && (
        <div className="fixed inset-x-4 bottom-40 z-40 mx-auto flex max-w-md flex-col overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl">
          <div className="flex items-center gap-2 border-b border-gray-800 bg-gray-900/60 px-4 py-3">
            <Bot className="h-4 w-4 text-amber-400" strokeWidth={2} />
            <p className="text-sm font-semibold text-white">Concierge</p>
            <p className="text-xs text-gray-500">— describe what you need</p>
          </div>

          <div className="max-h-96 overflow-y-auto px-4 py-3">
            {!matches && !loading && !error && (
              <div className="space-y-2">
                <p className="text-sm text-gray-500">
                  e.g. &ldquo;I want to protect my Venus position from liquidation&rdquo; or
                  &ldquo;maximize yield on $1000 in BNB&rdquo;
                </p>
                <p className="text-xs text-gray-600">
                  Semantic search over the real catalog — not a chatbot, no conversation, just
                  the closest real matches to what you describe.
                </p>
              </div>
            )}

            {loading && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
                Finding the best match…
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            {matches && matches.length === 0 && (
              <p className="text-sm text-gray-500">
                No agents match that yet — try{' '}
                <Link href="/" className="text-amber-400 hover:text-amber-300" onClick={() => setOpen(false)}>
                  browsing the catalog
                </Link>{' '}
                instead.
              </p>
            )}

            {matches && matches.length > 0 && (
              <div className="space-y-2">
                {usedFallback && (
                  <p className="text-xs text-gray-600">Closest matches by keyword:</p>
                )}
                {matches.map((m) => {
                  const Icon = CATEGORY_ICONS[m.category] ?? Bot;
                  return (
                    <Link
                      key={m.id}
                      href={`/agent/${m.id}`}
                      onClick={() => setOpen(false)}
                      className="block rounded-xl border border-gray-800 bg-gray-900/50 p-3 hover:border-amber-500/30 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20">
                          <Icon className="h-4 w-4 text-amber-400" strokeWidth={2} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-white">{m.name}</p>
                            <span className="shrink-0 text-xs text-amber-400">
                              {formatPricing(m.pricing_type, m.pricing_value, m.pricing_currency)}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs text-gray-400">{m.description}</p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                            <span className="flex items-center gap-0.5">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              {m.avg_rating.toFixed(1)}
                            </span>
                            <span>{m.total_hires} hires</span>
                            {m.similarity !== null && (
                              <span>{Math.round(m.similarity * 100)}% match</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
                {matches.length >= 2 && (
                  <Link
                    href={`/arena?agentA=${matches[0].id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-800 py-2 text-xs font-medium text-gray-400 hover:border-amber-500/30 hover:text-amber-400 transition-colors"
                  >
                    <Swords className="h-3.5 w-3.5" strokeWidth={2} />
                    Compare top matches in Arena
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-gray-800 p-3">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Describe what you need…"
              className="flex-1 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-amber-500/50 focus:outline-none"
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !message.trim()}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-gray-950 disabled:opacity-40"
            >
              <Send className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
