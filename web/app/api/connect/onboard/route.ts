import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  isStripeConfigured,
  ensureConnectAccount,
  createConnectOnboardingLink,
  connectPayoutsEnabled,
} from "@/lib/stripe"

/**
 * Start (or resume) Stripe Connect onboarding so a tipster can be paid.
 *
 * Until a tipster completes this, the platform has no way to send them money —
 * Stripe needs their identity and bank details, and issues their 1099.
 * Returns a hosted Stripe URL the client should redirect to.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Payouts are not available yet. Please try again later." },
      { status: 503 }
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, isPremium: true, stripeAccountId: true },
  })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })
  if (!user.isPremium) {
    return NextResponse.json(
      { error: "Only premium tipsters earn payouts" },
      { status: 403 }
    )
  }

  try {
    const accountId = await ensureConnectAccount({
      existingAccountId: user.stripeAccountId,
      email: user.email,
    })

    if (accountId !== user.stripeAccountId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeAccountId: accountId },
      })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const url = await createConnectOnboardingLink(
      accountId,
      `${appUrl}/payouts?refresh=1`,
      `${appUrl}/payouts?onboarded=1`
    )
    return NextResponse.json({ url })
  } catch (err) {
    console.error("Connect onboarding failed:", err)
    return NextResponse.json({ error: "Could not start payout setup" }, { status: 500 })
  }
}

/** Current payout-onboarding status for the signed-in tipster. */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeAccountId: true, payoutsEnabled: true },
  })

  if (!user?.stripeAccountId) {
    return NextResponse.json({ connected: false, payoutsEnabled: false })
  }

  // Re-check with Stripe so the flag can't go stale if a webhook was missed.
  let enabled = user.payoutsEnabled
  if (isStripeConfigured()) {
    enabled = await connectPayoutsEnabled(user.stripeAccountId)
    if (enabled !== user.payoutsEnabled) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { payoutsEnabled: enabled },
      })
    }
  }

  return NextResponse.json({ connected: true, payoutsEnabled: enabled })
}
