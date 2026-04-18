import { NextResponse } from "next/server"
import { requireAdminApi } from "@/lib/admin"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  const { error } = await requireAdminApi()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") ?? "all"

  const where: Record<string, unknown> = {}
  if (status !== "all") where.status = status

  const payouts = await prisma.payout.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, username: true, email: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  const totals = await prisma.payout.aggregate({
    _sum: { amount: true, fee: true, netAmount: true },
    where: { status: "pending" },
  })

  return NextResponse.json({
    payouts,
    pendingTotal: totals._sum.netAmount ?? 0,
  })
}
