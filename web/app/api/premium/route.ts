import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isDemoBillingEnabled } from "@/lib/billing-guard"
import { hasAIAccess, isPremiumActive, aiAccessSource } from "@/lib/entitlements"

/**
 * DEMO-ONLY entitlement activation (no payment taken).
 *
 * Disabled unless DEMO_BILLING="true" AND NODE_ENV !== "production".
 * In production, premium/AI access is granted exclusively by the
 * signature-verified Stripe + RevenueCat webhooks. Real purchases go through
 * POST /api/checkout, which redirects to Stripe-hosted checkout.
 */
export async function POST(req: Request) {
  // Fail closed: never reachable in production, even if Stripe is misconfigured.
  if (!isDemoBillingEnabled()) {
    return new NextResponse(null, { status: 404 })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { type } = await req.json() // "premium" | "ai"

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  if (type === "premium") {
    if (user.isPremium && user.premiumUntil && user.premiumUntil > new Date()) {
      return NextResponse.json({ error: "Already a premium member" }, { status: 409 })
    }

    const premiumUntil = new Date()
    premiumUntil.setMonth(premiumUntil.getMonth() + 1)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isPremium: true,
        premiumSince: user.premiumSince ?? new Date(),
        premiumUntil,
      },
    })

    return NextResponse.json({
      message: "Premium membership activated",
      premiumUntil,
    })
  }

  if (type === "ai") {
    const existing = await prisma.aISubscription.findUnique({ where: { userId: user.id } })

    const expiresAt = new Date()
    expiresAt.setMonth(expiresAt.getMonth() + 1)

    if (existing) {
      await prisma.aISubscription.update({
        where: { userId: user.id },
        data: { status: "active", expiresAt },
      })
    } else {
      await prisma.aISubscription.create({
        data: { userId: user.id, status: "active", expiresAt },
      })
    }

    return NextResponse.json({ message: "AI subscription activated", expiresAt })
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 })
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { aiSubscription: true },
  })

  return NextResponse.json({
    isPremium: isPremiumActive(user),
    premiumUntil: user?.premiumUntil,
    // Premium bundles AI Picks, so hasAI is true for active premium members
    // even without a standalone AI subscription.
    hasAI: hasAIAccess(user),
    aiAccessSource: aiAccessSource(user),
    aiExpiresAt: user?.aiSubscription?.expiresAt,
  })
}
