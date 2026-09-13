import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { check, clientKey, tooManyRequests } from "@/lib/rate-limit"
import {
  runSupportAgent,
  loadAccountContext,
  isSupportConfigured,
  type SupportTurn,
} from "@/lib/support-agent"

const MAX_TURNS = 30
const MAX_MESSAGE_CHARS = 4000

export async function POST(req: Request) {
  if (!isSupportConfigured()) {
    return NextResponse.json(
      { error: "Live chat is unavailable. Please email support@intellabets.com." },
      { status: 503 }
    )
  }

  const session = await getServerSession(authOptions)

  // Every call here spends Anthropic tokens, and the route is reachable without
  // an account, so anonymous callers get a much tighter budget than signed-in
  // ones. Without this, a loop against this endpoint is a direct bill.
  const userId = session?.user?.id ?? null
  const limit = userId ? 20 : 5
  const rl = check(`support:${clientKey(req, userId)}`, limit, 300)
  if (!rl.ok) {
    return tooManyRequests(
      rl.retryAfter,
      "Too many messages in a short time. Please wait a moment, or email support@intellabets.com."
    )
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 })
  }
  if (body.message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 })
  }

  const rawHistory: SupportTurn[] = Array.isArray(body.history) ? body.history : []
  const history = rawHistory
    .filter(
      (t): t is SupportTurn =>
        t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string"
    )
    // Trim to the most recent turns so a long session can't grow unbounded.
    .slice(-MAX_TURNS)
  history.push({ role: "user", content: body.message })

  // Only load account state for a signed-in user, and only ever their OWN.
  const account = session?.user?.id ? await loadAccountContext(session.user.id) : null

  const { reply, escalation } = await runSupportAgent(history, account)

  let ticketId: string | null = null
  if (escalation) {
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: session?.user?.id ?? null,
        subject: escalation.subject.slice(0, 200),
        category: escalation.category,
        priority: escalation.priority,
        // Snapshot what the agent could see, so the ticket is actionable
        // without going back to the customer.
        diagnostics: {
          agentSummary: escalation.summary,
          account: account ?? null,
          capturedAt: new Date().toISOString(),
        } as object,
        messages: {
          create: [
            ...history.map((t) => ({ role: t.role, content: t.content })),
            { role: "assistant", content: reply },
          ],
        },
      },
    })
    ticketId = ticket.id
  }

  return NextResponse.json({ reply, escalated: Boolean(escalation), ticketId })
}
