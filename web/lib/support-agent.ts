import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/prisma"
import { hasAIAccess, isPremiumActive, aiAccessSource } from "@/lib/entitlements"

/**
 * AI support agent.
 *
 * Design constraints, in order of importance:
 *
 * 1. READ-ONLY. The agent is given no tool that can grant entitlements, change
 *    billing, or issue refunds — only diagnosis and escalation. A support bot
 *    that can hand out premium is a revenue bypass wearing a friendly hat.
 * 2. It sees the customer's REAL account state, so it can answer "why can't I
 *    see picks" with the actual reason instead of generic troubleshooting.
 * 3. When it can't resolve something it escalates WITH the diagnostic snapshot
 *    attached, so whoever picks the ticket up doesn't have to re-interrogate
 *    the customer.
 */

const MODEL = process.env.SUPPORT_MODEL ?? "claude-opus-5"

/**
 * Stable system prompt — no user data, no timestamps, nothing per-request.
 * Keeping it byte-identical across requests is what makes the cache hit;
 * volatile account context goes in the messages array instead.
 */
const SYSTEM_PROMPT = `You are the support agent for IntellaBets, a sports analytics platform.

WHAT INTELLABETS IS
- It sells sports betting ANALYSIS by subscription. It is NOT a sportsbook: it never accepts wagers, holds betting funds, or places bets. Users place their own bets at their own sportsbook.
- Products: Premium Tipster ($19.99/mo — publish picks, sell subscriptions, keep 80%, and AI Picks is INCLUDED), AI Picks ($9.99/mo standalone), and individual tipster subscriptions ($4.99–$49.99/mo).
- The prediction engine finds positive-expected-value bets by comparing odds across sportsbooks, removing the bookmaker margin, and surfacing where the best available price beats the market consensus.

WHAT YOU CAN AND CANNOT DO
- You can read the customer's account state (shown to you below their message) and explain exactly what it means.
- You CANNOT grant subscriptions, change billing, issue refunds, or modify any account. Never promise to do any of those. If a customer needs one, escalate.
- Never invent account details. If something isn't in the context you were given, say you can't see it and escalate rather than guessing.

COMMON ISSUES AND THE REAL ANSWERS
- "I paid but have no access": entitlements are granted by the payment webhook, which can lag a minute or two. If their account shows no active subscription well after paying, escalate as billing/high — this usually means a webhook failed and needs manual repair.
- "AI Picks says I need a subscription but I'm Premium": Premium INCLUDES AI Picks. If their state shows active premium and they still can't access it, that's a real bug — escalate as access/high.
- "There are no picks today": this is normal and not a fault. The engine only surfaces bets where the best available price genuinely beats the market consensus, and real edges are rare. Some days have none. Never imply picks are guaranteed daily.
- "I cancelled but was charged again": escalate as billing/urgent. Cancellation should stop future billing at the end of the paid period.
- "How do I cancel": account settings. Cancelling stops future billing and they keep access until the end of the period already paid for.
- "Where's my payout": tipsters must complete payout onboarding (identity and bank details) before money can be sent, and there's a minimum balance. If onboarding is complete and a balance is owed but stuck, escalate as payout/high.
- "Is this pick guaranteed": absolutely not. Positive expected value means profitable over a large sample, not that any single bet wins. Never reassure a customer that a bet will win.

TONE AND LIMITS
- Be brief, concrete, and honest. Two or three short paragraphs at most.
- Never guarantee betting outcomes, promise profits, or encourage someone to bet more to recover losses.
- If a customer mentions gambling harm, gently point them to ncpgambling.org or 1-800-522-4700 and do not encourage further betting.
- Users must be 18+.

ESCALATION
Use the escalate_to_support tool when: the issue needs an account change you cannot make, the customer's state contradicts what they're experiencing (a likely bug), money is involved and looks wrong, or the customer asks for a human. Explain to the customer that you've escalated and that someone will follow up by email.`

/** Account snapshot the agent reasons over, and that gets attached to tickets. */
export interface AccountContext {
  userId: string
  email: string
  username: string
  isPremiumActive: boolean
  premiumUntil: string | null
  hasAIAccess: boolean
  aiAccessSource: string
  aiSubscriptionStatus: string | null
  aiSubscriptionExpires: string | null
  activeTipsterSubscriptions: { tipster: string; price: number; expiresAt: string }[]
  payouts: { pending: number; paid: number; onboardingComplete: boolean }
  accountCreated: string
}

export async function loadAccountContext(userId: string): Promise<AccountContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      aiSubscription: true,
      subscriptionsAsSubscriber: {
        where: { status: "active" },
        include: { tipster: { select: { username: true } } },
      },
      payouts: true,
    },
  })
  if (!user) return null

  return {
    userId: user.id,
    email: user.email,
    username: user.username,
    isPremiumActive: isPremiumActive(user),
    premiumUntil: user.premiumUntil?.toISOString() ?? null,
    hasAIAccess: hasAIAccess(user),
    aiAccessSource: aiAccessSource(user),
    aiSubscriptionStatus: user.aiSubscription?.status ?? null,
    aiSubscriptionExpires: user.aiSubscription?.expiresAt.toISOString() ?? null,
    activeTipsterSubscriptions: user.subscriptionsAsSubscriber.map((s) => ({
      tipster: s.tipster.username,
      price: s.price,
      expiresAt: s.expiresAt.toISOString(),
    })),
    payouts: {
      pending: user.payouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.netAmount, 0),
      paid: user.payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.netAmount, 0),
      onboardingComplete: user.payoutsEnabled,
    },
    accountCreated: user.createdAt.toISOString(),
  }
}

const ESCALATE_TOOL: Anthropic.Tool = {
  name: "escalate_to_support",
  description:
    "Escalate this conversation to a human. Use when the issue needs an account change you cannot make, when the customer's account state contradicts what they report (a likely bug), when money looks wrong, or when they ask for a human.",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "Short summary of the issue, under 80 characters." },
      category: {
        type: "string",
        enum: ["billing", "access", "payout", "technical", "other"],
      },
      priority: {
        type: "string",
        enum: ["low", "normal", "high", "urgent"],
        description: "urgent = money is wrong or a customer is being charged incorrectly.",
      },
      summary: {
        type: "string",
        description:
          "What you diagnosed and what you could not do. Written for the person who picks this up, not for the customer.",
      },
    },
    required: ["subject", "category", "priority", "summary"],
    additionalProperties: false,
  },
}

export interface SupportTurn {
  role: "user" | "assistant"
  content: string
}

export interface SupportReply {
  reply: string
  escalation: {
    subject: string
    category: string
    priority: string
    summary: string
  } | null
}

export function isSupportConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

export async function runSupportAgent(
  history: SupportTurn[],
  account: AccountContext | null
): Promise<SupportReply> {
  if (!isSupportConfigured()) {
    return {
      reply:
        "Live chat is temporarily unavailable. Please email support@intellabets.com and we'll get back to you.",
      escalation: null,
    }
  }

  const client = new Anthropic()

  // Account state goes in the MESSAGES, not the system prompt, so the cached
  // system prefix stays byte-identical across every customer.
  const contextBlock = account
    ? `[Account state for the customer you are talking to — not visible to them]\n${JSON.stringify(account, null, 2)}`
    : "[This customer is not signed in. You cannot see any account state. Ask them to sign in, or escalate if they cannot.]"

  const messages: Anthropic.MessageParam[] = [
    ...history.map((t) => ({ role: t.role, content: t.content }) as Anthropic.MessageParam),
    { role: "user", content: contextBlock },
  ]

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      // Support answers are short; low effort keeps replies fast and cheap.
      // The system prompt carries the domain knowledge, not the reasoning.
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      tools: [ESCALATE_TOOL],
      messages,
    })

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim()

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "escalate_to_support"
    )

    const escalation = toolUse
      ? (toolUse.input as { subject: string; category: string; priority: string; summary: string })
      : null

    return {
      reply:
        reply ||
        (escalation
          ? "I've escalated this to our team — someone will follow up with you by email shortly."
          : "Sorry, I didn't catch that. Could you rephrase?"),
      escalation,
    }
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return { reply: "We're getting a lot of requests right now. Please try again in a moment.", escalation: null }
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`Support agent API error ${err.status}:`, err.message)
    } else {
      console.error("Support agent failed:", err)
    }
    return {
      reply:
        "Something went wrong on our side. Please email support@intellabets.com and we'll pick it up from there.",
      escalation: null,
    }
  }
}
