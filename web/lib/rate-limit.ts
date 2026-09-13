/**
 * Minimal fixed-window rate limiter.
 *
 * State is per-instance and in-memory: on Vercel each serverless instance keeps
 * its own counters, and they reset on cold start. That means the effective
 * limit is (limit x number of warm instances), not a hard global cap.
 *
 * It is deliberately still worth having. The threat it addresses is someone
 * looping an endpoint that costs us money per call (the support agent spends
 * Anthropic tokens on every request, signed in or not). A per-instance window
 * stops that cheaply and with no extra infrastructure.
 *
 * If we ever need a real global cap — say we start getting distributed abuse,
 * not just one script — this should move behind Upstash Redis. The call sites
 * would not need to change; only the body of `check` would.
 */

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()

// Bound the map so a flood of unique IPs can't grow it without limit.
const MAX_KEYS = 10_000

function sweep(now: number) {
  // forEach rather than for..of: this package targets an ES level whose
  // Map iteration needs downlevelIteration, and that is not worth turning on
  // for one loop.
  const expired: string[] = []
  windows.forEach((w, key) => {
    if (w.resetAt <= now) expired.push(key)
  })
  expired.forEach((key) => windows.delete(key))
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  /** Seconds until the window resets. Send as Retry-After when ok is false. */
  retryAfter: number
}

export function check(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now()
  const existing = windows.get(key)

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_KEYS) sweep(now)
    windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
    return { ok: true, remaining: limit - 1, retryAfter: 0 }
  }

  existing.count += 1
  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
  if (existing.count > limit) {
    return { ok: false, remaining: 0, retryAfter }
  }
  return { ok: true, remaining: limit - existing.count, retryAfter }
}

/**
 * Best-effort client identity for rate limiting.
 *
 * A signed-in user is keyed by user id, which survives IP changes and is not
 * spoofable. Anonymous callers fall back to the forwarded IP. On Vercel
 * `x-forwarded-for` is set by the platform edge, so the left-most entry is the
 * real client; do not trust this header if we ever run behind something else.
 */
export function clientKey(req: Request, userId?: string | null): string {
  if (userId) return `u:${userId}`
  const fwd = req.headers.get("x-forwarded-for") ?? ""
  const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"
  return `ip:${ip}`
}

export function tooManyRequests(retryAfter: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter),
    },
  })
}
