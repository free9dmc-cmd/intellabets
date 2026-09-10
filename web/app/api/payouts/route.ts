import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isStripeConfigured, transferToTipster } from "@/lib/stripe"

const MINIMUM_WITHDRAWAL_USD = 10

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const payouts = await prisma.payout.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  })

  const paid = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.netAmount, 0)
  const available = payouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.netAmount, 0)
  const processing = payouts.filter((p) => p.status === "processing").reduce((s, p) => s + p.netAmount, 0)

  return NextResponse.json({
    payouts,
    // Lifetime paid out, currently withdrawable, and mid-transfer.
    paid,
    available,
    processing,
    minimumWithdrawal: MINIMUM_WITHDRAWAL_USD,
  })
}

/**
 * WITHDRAW earned funds to the tipster's connected Stripe account.
 *
 * The ledger is written by the Stripe webhook when money is actually received
 * (one pending Payout row per subscriber payment, already net of the platform
 * fee). This endpoint only MOVES money that was genuinely collected — it never
 * creates new earnings.
 *
 * The previous implementation recomputed earnings from active subscriptions
 * and inserted a second Payout row, double-counting revenue and crediting
 * subscriptions whose payment may never have cleared.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isPremium: true, stripeAccountId: true, payoutsEnabled: true },
  })
  if (!user?.isPremium) return NextResponse.json({ error: "Premium required" }, { status: 403 })

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Payouts are temporarily unavailable. Please try again later." },
      { status: 503 }
    )
  }
  if (!user.stripeAccountId || !user.payoutsEnabled) {
    return NextResponse.json(
      {
        error: "Set up payouts before withdrawing.",
        code: "CONNECT_ONBOARDING_REQUIRED",
      },
      { status: 409 }
    )
  }

  // Claim the pending rows first so a double-submit can't transfer twice.
  const pending = await prisma.payout.findMany({
    where: { userId: user.id, status: "pending" },
    select: { id: true, netAmount: true },
  })
  const amount = pending.reduce((s, p) => s + p.netAmount, 0)

  if (amount < MINIMUM_WITHDRAWAL_USD) {
    return NextResponse.json(
      { error: `Minimum withdrawal is $${MINIMUM_WITHDRAWAL_USD}. You have $${amount.toFixed(2)} available.` },
      { status: 400 }
    )
  }

  const ids = pending.map((p) => p.id)
  const claimed = await prisma.payout.updateMany({
    where: { id: { in: ids }, status: "pending" },
    data: { status: "processing" },
  })
  if (claimed.count === 0) {
    return NextResponse.json({ error: "Withdrawal already in progress" }, { status: 409 })
  }

  // Idempotency key derived from the exact rows being paid, so a retry of the
  // same withdrawal can never move money twice.
  const idempotencyKey = `payout:${user.id}:${[...ids].sort().join(",")}`

  const result = await transferToTipster({
    accountId: user.stripeAccountId,
    amountUsd: amount,
    idempotencyKey,
    description: `IntellaBets payout (${ids.length} payment${ids.length === 1 ? "" : "s"})`,
  })

  if (!result.ok) {
    // Release the claim so the tipster can retry.
    await prisma.payout.updateMany({
      where: { id: { in: ids }, status: "processing" },
      data: { status: "pending" },
    })
    return NextResponse.json({ error: `Transfer failed: ${result.error}` }, { status: 502 })
  }

  await prisma.payout.updateMany({
    where: { id: { in: ids } },
    data: { status: "paid", paidAt: new Date() },
  })

  return NextResponse.json({
    message: `$${amount.toFixed(2)} is on its way to your bank account.`,
    amount,
    transferId: result.transferId,
    payoutsSettled: ids.length,
  })
}
