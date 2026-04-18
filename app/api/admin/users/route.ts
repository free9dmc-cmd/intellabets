import { NextResponse } from "next/server"
import { requireAdminApi } from "@/lib/admin"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  const { error } = await requireAdminApi()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search") ?? ""
  const filter = searchParams.get("filter") ?? "all"
  const page = parseInt(searchParams.get("page") ?? "1")
  const limit = 25

  const where: Record<string, unknown> = {}
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
      { username: { contains: search } },
    ]
  }
  if (filter === "premium") where.isPremium = true
  if (filter === "free") where.isPremium = false
  if (filter === "verified") where.isVerified = true

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, username: true, image: true,
        isPremium: true, isVerified: true, subscriberCount: true,
        totalEarnings: true, totalWins: true, totalLosses: true,
        createdAt: true, premiumUntil: true,
        _count: { select: { betslips: true, subscriptionsAsTipster: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ])

  return NextResponse.json({ users, total, pages: Math.ceil(total / limit) })
}
