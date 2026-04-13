import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sport = searchParams.get("sport")
  const sortBy = searchParams.get("sortBy") ?? "winRate" // winRate | subscribers | roi | earnings

  const where: Record<string, unknown> = {
    isPremium: true,
    OR: [
      { totalWins: { gt: 0 } },
      { totalLosses: { gt: 0 } },
    ],
  }

  const orderByMap: Record<string, unknown> = {
    winRate: { winRate: "desc" },
    subscribers: { subscriberCount: "desc" },
    roi: { roi: "desc" },
    earnings: { totalEarnings: "desc" },
  }

  const tipsters = await prisma.user.findMany({
    where,
    select: {
      id: true,
      username: true,
      name: true,
      image: true,
      isPremium: true,
      isVerified: true,
      bio: true,
      specialties: true,
      subscriptionPrice: true,
      totalWins: true,
      totalLosses: true,
      totalPushes: true,
      winRate: true,
      roi: true,
      totalEarnings: true,
      subscriberCount: true,
      createdAt: true,
    },
    orderBy: orderByMap[sortBy] as never,
    take: 50,
  })

  // Filter by sport if requested (specialties is comma-separated)
  const filtered = sport
    ? tipsters.filter((t) => t.specialties?.toLowerCase().includes(sport.toLowerCase()))
    : tipsters

  return NextResponse.json({ tipsters: filtered })
}
