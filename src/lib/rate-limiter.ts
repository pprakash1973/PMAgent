/**
 * Simple in-memory rate limiter.
 * For multi-instance deployments, swap the store for a Redis-backed implementation.
 */

interface Entry { count: number; resetAt: number }
const store = new Map<string, Entry>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count++;
  return {
    allowed:   entry.count <= maxRequests,
    remaining: Math.max(0, maxRequests - entry.count),
    resetAt:   entry.resetAt,
  };
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}

// Purge expired entries periodically to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60_000);
