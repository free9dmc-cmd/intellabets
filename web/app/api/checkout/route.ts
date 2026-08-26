import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isDemoBillingEnabled } from "@/lib/billing-guard"
import {
  isStripeConfigured,
  createPremiumCheckout,
  createAICheckout,
  createTipsterCheckout,
} from "@/lib/stripe"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isStripeConfigured()) {
    // Locally (with DEMO_BILLING=true) the client falls back to the mock
    // activation endpoints. In production that fallback is a 404 by design,
    // so surface a real error instead of pretending checkout "worked".
    if (isDemoBillingEnabled()) {
      return NextResponse.json({ demo: true })
    }
    console.error("Checkout attempted but STRIPE_SECRET_KEY is not configured")
    return NextResponse.json(
      { error: "Payments are temporarily unavailable. Please try again later." },
      { status: 503 }
    )
  }

  const { type, tipsterId } = await req.json()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

  try {
    if (type === "premium") {
      const stripeSession = await createPremiumCheckout(
        session.user.id,
        `${appUrl}/checkout/success?type=premium`,
        `${appUrl}/premium`
      )
      return NextResponse.json({ url: stripeSession.url })
    }

    if (type === "ai") {
      const stripeSession = await createAICheckout(
        session.user.id,
        `${appUrl}/checkout/success?type=ai`,
        `${appUrl}/premium`
      )
      return NextResponse.json({ url: stripeSession.url })
    }

    if (type === "tipster" && tipsterId) {
      const tipster = await prisma.user.findUnique({
        where: { id: tipsterId },
        select: { username: true, subscriptionPrice: true },
      })
      if (!tipster) return NextResponse.json({ error: "Tipster not found" }, { status: 404 })

      const stripeSession = await createTipsterCheckout(
        session.user.id,
        tipsterId,
        tipster.subscriptionPrice ?? 9.99,
        tipster.username,
        `${appUrl}/checkout/success?type=tipster&tipsterId=${tipsterId}`,
        `${appUrl}/profile/${tipster.username}`
      )
      return NextResponse.json({ url: stripeSession.url })
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  } catch (err: unknown) {
    console.error("Checkout error:", err)
    return NextResponse.json({ error: "Checkout creation failed" }, { status: 500 })
  }
}
