/**
 * Small in-process LRU with a TTL, for route handlers that spend third-party
 * quota on answers that repeat (a YouTube search.list call costs 100 units).
 * Per-instance only: it absorbs repeats within a warm lambda, it is not a
 * shared cache. Only successful answers should be stored.
 */
export function createTtlCache<T>({
  max,
  ttlMs,
  now = () => Date.now(),
}: {
  max: number;
  ttlMs: number;
  now?: () => number;
}) {
  const entries = new Map<string, { value: T; expiresAt: number }>();

  return {
    get(key: string): T | undefined {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (hit.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      // Refresh recency: Map iteration order is insertion order.
      entries.delete(key);
      entries.set(key, hit);
      return hit.value;
    },
    set(key: string, value: T) {
      entries.delete(key);
      entries.set(key, { value, expiresAt: now() + ttlMs });
      while (entries.size > max) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
    get size() {
      return entries.size;
    },
  };
}
