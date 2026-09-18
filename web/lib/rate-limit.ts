/**
 * Fixed-window rate limiting.
 *
 * Two layers, checked in order:
 *
 *   1. An in-memory counter, per serverless instance. Cheap, no I/O, and
 *      catches a tight loop that happens to land on one warm instance.
 *   2. A Postgres counter shared by every instance. This is the one that
 *      actually enforces the limit.
 *
 * The in-memory layer alone was the previous implementation, and it did not
 * work: seven requests against a limit of five all passed against the live
 * site, because Vercel spread them across cold instances that each started
 * from zero. It is kept only as a backstop for when the database is
 * unreachable -- some protection beats none.
 *
 * The database layer FAILS OPEN. If Postgres is down, requests are allowed
 * rather than the site rejecting every signup and support message. That is
 * the right trade for availability, and it is why the in-memory layer stays.
 */

import { prisma } from "./prisma"

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

/** In-memory layer. Synchronous, per-instance, advisory only. */
function checkLocal(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now()
  const existing = windows.get(key)

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_KEYS) sweep(now)
    windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
    return { ok: true, remaining: limit - 1, retryAfter: 0 }
  }

  existing.count += 1
  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
  if (existing.count > limit) return { ok: false, remaining: 0, retryAfter }
  return { ok: true, remaining: limit - existing.count, retryAfter }
}

interface CounterRow {
  count: number
  resetAt: Date
}

/**
 * Durable layer.
 *
 * One statement does the whole window: insert the key, or bump it, or reset it
 * if its window has passed. Doing it in a single INSERT ... ON CONFLICT keeps
 * it atomic under concurrency -- a read-then-write would let simultaneous
 * requests both see the old count and both be allowed through.
 */
async function checkShared(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult | null> {
  try {
    const rows = await prisma.$queryRaw<CounterRow[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, NOW() + ${`${windowSeconds} seconds`}::interval)
      ON CONFLICT ("key") DO UPDATE SET
        "count"   = CASE WHEN "RateLimit"."resetAt" <= NOW()
                         THEN 1 ELSE "RateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" <= NOW()
                         THEN NOW() + ${`${windowSeconds} seconds`}::interval
                         ELSE "RateLimit"."resetAt" END
      RETURNING "count", "resetAt"
    `
    const row = rows[0]
    if (!row) return null

    const retryAfter = Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000))
    if (row.count > limit) return { ok: false, remaining: 0, retryAfter }
    return { ok: true, remaining: Math.max(0, limit - row.count), retryAfter }
  } catch (err) {
    // Fail open: a database problem must not stop people signing up or
    // asking for support. The in-memory layer still applies.
    console.error("rate-limit: shared counter unavailable", err)
    return null
  }
}

/**
 * Check one key against a limit. Await this before doing the work you are
 * protecting.
 */
export async function check(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const local = checkLocal(key, limit, windowSeconds)
  if (!local.ok) return local

  const shared = await checkShared(key, limit, windowSeconds)
  return shared ?? local
}

/**
 * Delete counters whose window closed over an hour ago.
 *
 * Call from a scheduled job. Nothing depends on it for correctness -- an
 * expired row is reset in place the next time its key is seen -- it just stops
 * the table growing forever from one-off IPs.
 */
export async function pruneExpired(): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({
    where: { resetAt: { lt: new Date(Date.now() - 3600_000) } },
  })
  return count
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
