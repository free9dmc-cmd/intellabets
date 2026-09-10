import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cancelStripeSubscription } from "@/lib/stripe"

/**
 * Cancel a Premium membership or a standalone AI Picks subscription.
 *
 * Previously there was NO cancellation path for either — a customer who wanted
 * out had no in-app way to stop being billed, which is both a consumer-
 * protection problem and a direct route to card disputes.
 *
 * Cancels at period end: the customer keeps the access they already paid for,
 * and the `customer.subscription.deleted` webhook revokes it when the period
 * actually lapses. We do NOT flip entitlement flags here.
 *
 * Body: { type: "premium" | "ai" }
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { type } = await req.json().catch(() => ({ type: null }))
  if (type !== "premium" && type !== "ai") {
    return NextResponse.json({ error: 'type must be "premium" or "ai"' }, { status: 400 })
  }

  if (type === "premium") {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isPremium: true, premiumUntil: true, premiumStripeSubId: true },
    })
    if (!user?.isPremium) {
      return NextResponse.json({ error: "No active premium membership" }, { status: 409 })
    }

    const cancelled = await cancelStripeSubscription(user.premiumStripeSubId)
    if (!cancelled && user.premiumStripeSubId) {
      return NextResponse.json(
        { error: "Could not reach the payment provider. Please try again or contact support." },
        { status: 502 }
      )
    }

    return NextResponse.json({
      message: "Premium membership will end at the close of your current billing period.",
      accessUntil: user.premiumUntil,
      // True when there is no Stripe subscription behind it (e.g. an
      // admin-granted or demo membership) — nothing to bill, nothing to cancel.
      hadNoBillingSubscription: !user.premiumStripeSubId,
    })
  }

  const aiSub = await prisma.aISubscription.findUnique({
    where: { userId: session.user.id },
    select: { status: true, expiresAt: true, stripeSubId: true },
  })
  if (!aiSub || aiSub.status !== "active") {
    return NextResponse.json({ error: "No active AI subscription" }, { status: 409 })
  }

  const cancelled = await cancelStripeSubscription(aiSub.stripeSubId)
  if (!cancelled && aiSub.stripeSubId) {
    return NextResponse.json(
      { error: "Could not reach the payment provider. Please try again or contact support." },
      { status: 502 }
    )
  }

  return NextResponse.json({
    message: "AI Picks subscription will end at the close of your current billing period.",
    accessUntil: aiSub.expiresAt,
    hadNoBillingSubscription: !aiSub.stripeSubId,
  })
}
