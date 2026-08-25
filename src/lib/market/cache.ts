/**
 * Tiny in-memory TTL cache for third-party market data fetches, so the
 * Concierge/Arena/agent pages don't hammer Venus/DefiLlama/Binance on every
 * page load. Same Map + expiry idiom as src/lib/rate-limit/index.ts.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(key);
  }
}, 5 * 60 * 1000);

/** Returns the cached value for `key`, or fetches+caches via `fn` if missing/expired. */
export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = store.get(key);
  if (entry && now < entry.expiresAt) {
    return entry.value as T;
  }
  const value = await fn();
  store.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
  return value;
}
