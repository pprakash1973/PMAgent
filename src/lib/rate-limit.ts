import { NextRequest, NextResponse } from "next/server";

type Bucket = { count: number; resetAt: number };

// In-process fixed-window counter. Adequate for a single App Service instance;
// swap the store for Redis when scaling past one replica.
const buckets = new Map<string, Bucket>();

function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Fixed-window rate limit. Returns a 429 response when the caller is over budget,
 * otherwise null.
 */
export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): NextResponse | null {
  const now = Date.now();
  sweep(now);

  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return null;
  }

  b.count += 1;
  if (b.count > opts.limit) {
    const retryAfter = Math.ceil((b.resetAt - now) / 1000);
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests. Try again shortly." } },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }
  return null;
}
