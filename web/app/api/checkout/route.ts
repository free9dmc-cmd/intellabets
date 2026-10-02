import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isDemoBillingEnabled } from "@/lib/billing-guard"
import { billingUnavailableResponse, isBillingAuthError } from "@/lib/billing/degradation"
import { resolveProvider } from "@/lib/billing/registry"
import type { PlanId } from "@/lib/billing/types"
import { isStripeConfigured, createTipsterCheckout } from "@/lib/stripe"

// Prisma + node crypto inside the providers require the Node.js runtime.
export const runtime = "nodejs"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { type, tipsterId, providerId, walletAddress } = await req.json()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

  // ── First-party plans (premium / AI) go through the processor-agnostic rails.
  if (type === "premium" || type === "ai") {
    const plan = type as PlanId
    const provider = resolveProvider(providerId)

    if (!provider) {
      // No rail configured. Locally (DEMO_BILLING=true) the client falls back to
      // the mock activation endpoint; in production that endpoint is a 404 by
      // design, so surface the clean 503 instead of pretending it worked.
      if (isDemoBillingEnabled()) return NextResponse.json({ demo: true })
      return billingUnavailableResponse()
    }

    try {
      const result = await provider.createCheckout({
        plan,
        userId: session.user.id,
        userEmail: session.user.email,
        successUrl: `${appUrl}/checkout/success?type=${plan}`,
        cancelUrl: `${appUrl}/premium`,
        // web3: the browser-connected wallet, if the client sent one.
        walletAddress: typeof walletAddress === "string" ? walletAddress : null,
      })
      return NextResponse.json({ ...result, providerId: provider.id })
    } catch (err: unknown) {
      console.error("Checkout error:", err)
      if (isBillingAuthError(err)) return billingUnavailableResponse()
      return NextResponse.json({ error: "Checkout creation failed" }, { status: 500 })
    }
  }

  // ── Tipster subscriptions remain on Stripe (Stripe Connect handles payouts).
  if (type === "tipster" && tipsterId) {
    if (!isStripeConfigured()) {
      if (isDemoBillingEnabled()) return NextResponse.json({ demo: true })
      return billingUnavailableResponse()
    }
    try {
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
      return NextResponse.json({ kind: "redirect", url: stripeSession.url })
    } catch (err: unknown) {
      console.error("Tipster checkout error:", err)
      if (isBillingAuthError(err)) return billingUnavailableResponse()
      return NextResponse.json({ error: "Checkout creation failed" }, { status: 500 })
    }
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 })
}
