import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { requireAdminApi } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { isEngineConfigured, listStrategies } from "@/lib/engine"

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
    return { name: "database", status: "ok", detail: `connected, ${users} users` }
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
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return {
      name: "anthropic",
      status: "misconfigured",
      detail: "ANTHROPIC_API_KEY not set - AI picks and support chat are both offline",
    }
  }
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

async function checkEngine(): Promise<Check> {
  if (!isEngineConfigured()) {
    return {
      name: "engine",
      status: "misconfigured",
      detail: "ENGINE_SERVICE_KEY not set or too short - the picks pages will be empty",
    }
  }
  const result = await listStrategies()
  if (!result) {
    return {
      name: "engine",
      status: "failing",
      detail:
        "no response from the engine - check ENGINE_API_URL, and that ENGINE_SERVICE_KEY matches the value set in Render",
    }
  }
  return { name: "engine", status: "ok", detail: `${result.strategies.length} strategies available` }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function GET() {
  const { error } = await requireAdminApi()
  if (error) return error

  const checks = await Promise.all([
    checkDatabase(),
    checkRateLimitTable(),
    checkAnthropic(),
    checkEngine(),
  ])

  const healthy = checks.every((c) => c.status === "ok")
  return NextResponse.json(
    { healthy, checks },
    { status: healthy ? 200 : 503 }
  )
}
