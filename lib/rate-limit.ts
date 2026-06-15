/**
 * In-memory rate limiter for auth endpoints.
 * Keys can be IP-only or composite e.g. `email:user@x.com`.
 */
const buckets: Map<string, { count: number; resetAt: number }> = new Map();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  buckets.set(key, bucket);
  return { ok: true };
}
