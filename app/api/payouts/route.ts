import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { calcTipsterPayout } from "@/lib/stripe"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const payouts = await prisma.payout.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  })

  const total = payouts.reduce((s, p) => s + p.netAmount, 0)
  const pending = payouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.netAmount, 0)

  return NextResponse.json({ payouts, total, pending })
}

// Request a payout (simulated)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user?.isPremium) return NextResponse.json({ error: "Premium required" }, { status: 403 })

  // Calculate current month's earnings from subscriptions
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const existingPayout = await prisma.payout.findFirst({
    where: { userId: user.id, period },
  })
  if (existingPayout) {
    return NextResponse.json({ error: "Payout already requested for this period" }, { status: 409 })
  }

  const subs = await prisma.subscription.findMany({
    where: {
      tipsterId: user.id,
      status: "active",
      createdAt: { gte: startOfMonth },
    },
  })

  const grossAmount = subs.reduce((s, sub) => s + sub.price, 0)
  if (grossAmount < 10) {
    return NextResponse.json({ error: "Minimum payout is $10" }, { status: 400 })
  }

  const { fee, net } = calcTipsterPayout(grossAmount)

  const payout = await prisma.payout.create({
    data: {
      userId: user.id,
      amount: grossAmount,
      fee,
      netAmount: net,
      period,
      status: "pending",
    },
  })

  // Update total earnings
  await prisma.user.update({
    where: { id: user.id },
    data: { totalEarnings: { increment: net } },
  })

  return NextResponse.json({ payout }, { status: 201 })
}
