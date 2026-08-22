/**
 * Minimal fixed-window rate limiter for expensive routes (LLM calls, file parsing).
 *
 * SCOPE AND LIMITATION: state lives in module memory, so on Vercel the budget is
 * enforced per warm serverless instance, not globally. That still blocks the common
 * abuse case (one client looping requests against a warm instance) and costs nothing,
 * but it is NOT a hard global guarantee. Move to Redis/Postgres if a strict org-wide
 * quota is required.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Bound memory: sweep expired buckets once the map grows past this.
const SWEEP_THRESHOLD = 5000;

function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets. 0 when `ok` is true. */
  retryAfterSec: number;
  remaining: number;
}

/**
 * Consumes one unit from `key`'s budget.
 *
 * @param key      Identity to bill — always scope by user (and route) so one tenant
 *                 cannot exhaust another's budget.
 * @param limit    Max requests allowed per window.
 * @param windowMs Window length in milliseconds.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (buckets.size > SWEEP_THRESHOLD) sweep(now);

  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)), remaining: 0 };
  }

  bucket.count++;
  return { ok: true, retryAfterSec: 0, remaining: limit - bucket.count };
}

/**
 * Alternate shape used by the auth, chat, submit and schedule-AI routes.
 *
 * This was previously a second, independent limiter in `rate-limiter.ts` with its own
 * Map and a module-level `setInterval` sweep — a timer that never clears and keeps the
 * event loop referenced. Both limiters now share the one store above; the signature is
 * kept so those call sites did not have to change.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const result = rateLimit(key, maxRequests, windowMs);
  return {
    allowed: result.ok,
    remaining: result.remaining,
    resetAt: Date.now() + result.retryAfterSec * 1000,
  };
}

/** Best-effort client IP from proxy headers. Only meaningful behind a trusted proxy. */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}
