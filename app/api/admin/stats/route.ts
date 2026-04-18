import { NextResponse } from "next/server"
import { requireAdminApi } from "@/lib/admin"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const { error } = await requireAdminApi()
  if (error) return error

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalUsers,
    premiumUsers,
    aiSubs,
    activeSubs,
    payoutTotals,
    monthlyFees,
    totalBetslips,
    newUsersThisMonth,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isPremium: true } }),
    prisma.aISubscription.count({ where: { status: "active", expiresAt: { gt: now } } }),
    prisma.subscription.count({ where: { status: "active", expiresAt: { gt: now } } }),
    prisma.payout.aggregate({
      _sum: { amount: true, fee: true, netAmount: true },
      where: { status: "paid" },
    }),
    prisma.payout.aggregate({
      _sum: { fee: true },
      where: { createdAt: { gte: startOfMonth } },
    }),
    prisma.betslip.count(),
    prisma.user.count({ where: { createdAt: { gte: last30 } } }),
  ])

  return NextResponse.json({
    totalUsers,
    premiumUsers,
    aiSubs,
    activeSubs,
    totalBetslips,
    newUsersThisMonth,
    platformRevenue: payoutTotals._sum.fee ?? 0,
    totalPaidOut: payoutTotals._sum.netAmount ?? 0,
    monthlyFees: monthlyFees._sum.fee ?? 0,
  })
}
