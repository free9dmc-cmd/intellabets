import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireAdminApi } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { getIngestionStatusDetailed, isEngineConfigured, type IngestionStatus } from "@/lib/engine"
import { anthropicKey, anthropicKeyProblem } from "@/lib/anthropic-key"
import { isEmailConfigured } from "@/lib/email"

export const dynamic = "force-dynamic"

/**
 * Admin-only dependency check.
 *
 * Every external dependency here fails silently in normal use: a bad
 * ANTHROPIC_API_KEY shows the customer "something went wrong", a missing
 * ENGINE_SERVICE_KEY shows an empty picks page. Both are indistinguishable
 * from "no results right now" unless you go reading runtime logs. This says
 * which one is actually broken, and why.
 *
 * Admin-gated because the failure reasons name internal services.
 */

type Status = "ok" | "misconfigured" | "failing"

interface Check {
  name: string
  status: Status
  detail: string
}

async function checkDatabase(): Promise<Check> {
  try {
    const users = await prisma.user.count()
    // count() only touches the row count, not the column list, so it stays
    // green even when schema.prisma has drifted from the live table (e.g. a
    // column added to the schema but never applied with `prisma db push`).
    // findFirst selects every scalar field and will throw if any of them
    // don't exist in the database -- which is exactly the failure mode that
    // silently broke login and registration on 2026-09-24.
    await prisma.user.findFirst()
    return { name: "database", status: "ok", detail: `connected, ${users} users, schema matches` }
  } catch (err) {
    return { name: "database", status: "failing", detail: message(err) }
  }
}

async function checkRateLimitTable(): Promise<Check> {
  // The limiter fails open, so a missing table means limits silently do
  // nothing rather than erroring. Worth stating plainly.
  try {
    await prisma.rateLimit.count()
    return { name: "rate-limit-store", status: "ok", detail: "table present, limits enforced" }
  } catch {
    return {
      name: "rate-limit-store",
      status: "misconfigured",
      detail: 'RateLimit table missing - run "prisma db push". Limits are NOT being enforced.',
    }
  }
}

async function checkAnthropic(): Promise<Check> {
  // Shape problems first: they are the common cause and need no network call.
  const problem = anthropicKeyProblem()
  if (problem) {
    return { name: "anthropic", status: "misconfigured", detail: problem }
  }
  const key = anthropicKey() as string
  try {
    // Smallest possible real call: proves the key is valid and the account has
    // credit, which merely reading the variable does not.
    const client = new Anthropic({ apiKey: key })
    await client.messages.create({
      model: process.env.SUPPORT_MODEL ?? "claude-opus-5",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    })
    return { name: "anthropic", status: "ok", detail: "key valid, API reachable" }
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status : null
    const hint =
      status === 401
        ? "key is invalid or revoked"
        : status === 400
          ? "request rejected - check the model name in SUPPORT_MODEL/AI_MODEL"
          : status === 429
            ? "rate limited or out of credit"
            : "see detail"
    return { name: "anthropic", status: "failing", detail: `${status ?? "error"}: ${hint} (${message(err)})` }
  }
}

async function checkEmail(): Promise<Check> {
  // Password reset is the only thing that needs email, and it is designed to
  // stay silent on failure so it cannot be used to discover which addresses
  // have accounts. That means a broken sender looks exactly like a working one
  // from outside -- this is the only place it shows up.
  if (!isEmailConfigured()) {
    return {
      name: "email",
      status: "misconfigured",
      detail:
        "RESEND_API_KEY not set or malformed - password reset emails are NOT being delivered, and the flow cannot report that to users by design",
    }
  }
  return {
    name: "email",
    status: "ok",
    detail: "sender configured (delivery still requires a verified domain at the provider)",
  }
}

async function checkEngine(): Promise<Check[]> {
  if (!isEngineConfigured()) {
    return [
      {
        name: "engine",
        status: "misconfigured",
        detail: "ENGINE_SERVICE_KEY not set or too short - the picks pages will be empty",
      },
    ]
  }
  // /ingestion/status needs the service key, so success proves the key matches
  // the engine's; each failure status means something different.
  const res = await getIngestionStatusDetailed()
  if (!res.ok) {
    const detail =
      res.status === 401 || res.status === 403
        ? "the engine rejected our key - make ENGINE_SERVICE_KEY identical in Vercel and Render"
        : res.status === 404
          ? "the engine predates /ingestion/status - redeploy the engine"
          : res.status === 429
            ? "the engine rate-limited this server, so it did not accept our key (a valid service key is never throttled) - make ENGINE_SERVICE_KEY identical in Vercel and Render, at least 16 characters"
            : res.status === null
              ? "no response from the engine within 10s - check ENGINE_API_URL and that the Render service is running"
              : `the engine returned ${res.status} - check its logs on Render`
    return [{ name: "engine", status: "failing", detail }]
  }
  return [
    { name: "engine", status: "ok", detail: "reachable, service key accepted" },
    checkOddsFeed(res.data),
  ]
}

/** Whether fresh odds are arriving. Picks are only as current as the last snapshot. */
function checkOddsFeed(status: IngestionStatus): Check {
  const { configured, feed, data } = status
  const credits = feed.quota ? `; ${feed.quota.remaining} API credits left` : ""
  if (!configured) {
    return { name: "odds-feed", status: "misconfigured", detail: "THE_ODDS_API_KEY not set on Render - no odds, no picks" }
  }
  const lastSnap = data.lastSnapshotAt ? new Date(data.lastSnapshotAt) : null
  const ageHours = lastSnap ? (Date.now() - lastSnap.getTime()) / 3_600_000 : Infinity
  const err = feed.lastError
  const errIsLatest = err && (!feed.lastSuccessAt || err.at > feed.lastSuccessAt)
  if (errIsLatest && (err.status === 401 || err.status === 403)) {
    return {
      name: "odds-feed",
      status: "failing",
      detail: `The Odds API rejected the key (${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}) - replace THE_ODDS_API_KEY on Render or top up the plan's credits${credits}`,
    }
  }
  const age = lastSnap ? `last odds ${ageHours < 1 ? `${Math.round(ageHours * 60)} min` : `${ageHours.toFixed(1)} h`} ago` : "no odds stored yet"
  const summary = `${age}; ${data.upcomingGames} upcoming games, ${data.livePicks} live picks${credits}`
  if (ageHours > 3) {
    return {
      name: "odds-feed",
      status: "failing",
      detail: `${summary}${errIsLatest ? `; last error ${err.status ?? ""} ${err.message}` : ""} - the engine may be asleep or polling is failing`,
    }
  }
  return { name: "odds-feed", status: "ok", detail: summary }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function GET() {
  const { error } = await requireAdminApi()
  if (error) return error

  const checks = (
    await Promise.all([checkDatabase(), checkRateLimitTable(), checkAnthropic(), checkEngine(), checkEmail()])
  ).flat()

  const healthy = checks.every((c) => c.status === "ok")
  return NextResponse.json(
    { healthy, checks },
    { status: healthy ? 200 : 503 }
  )
}
