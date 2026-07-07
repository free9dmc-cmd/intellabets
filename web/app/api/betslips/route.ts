import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { americanToDecimal, calcPotentialReturn } from "@/lib/utils"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")
  const sport = searchParams.get("sport")
  const status = searchParams.get("status")
  const publicOnly = searchParams.get("public") === "true"

  const where: Record<string, unknown> = {}

  if (userId) where.userId = userId
  if (sport) where.sport = sport
  if (status) where.status = status
  if (publicOnly) where.isPublic = true

  const betslips = await prisma.betslip.findMany({
    where,
    include: {
      bets: true,
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          image: true,
          isPremium: true,
          isVerified: true,
          winRate: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  return NextResponse.json({ betslips })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user?.isPremium) {
    return NextResponse.json({ error: "Premium membership required to create betslips" }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { title, description, sport, league, bets, stake, isPublic } = body

    if (!title || !sport || !bets || bets.length === 0) {
      return NextResponse.json({ error: "Title, sport, and at least one bet are required" }, { status: 400 })
    }

    // Calculate total odds (parlay if multiple bets)
    const totalDecimal = bets.reduce((acc: number, bet: { odds: number }) => {
      return acc * americanToDecimal(bet.odds)
    }, 1)

    const totalOdds = totalDecimal >= 2
      ? Math.round((totalDecimal - 1) * 100)
      : Math.round(-100 / (totalDecimal - 1))

    const potentialReturn = calcPotentialReturn(stake ?? 100, totalOdds)

    const betslip = await prisma.betslip.create({
      data: {
        userId: session.user.id,
        title,
        description,
        sport,
        league,
        stake: stake ?? 100,
        totalOdds,
        potentialReturn,
        isPublic: isPublic ?? false,
        bets: {
          create: bets.map((bet: {
            game: string; homeTeam?: string; awayTeam?: string;
            pick: string; odds: number; betType: string; line?: string;
            sport: string; gameDate?: string;
          }) => ({
            game: bet.game,
            homeTeam: bet.homeTeam,
            awayTeam: bet.awayTeam,
            pick: bet.pick,
            odds: bet.odds,
            betType: bet.betType,
            line: bet.line,
            sport: bet.sport,
            gameDate: bet.gameDate,
          })),
        },
      },
      include: { bets: true },
    })

    return NextResponse.json({ betslip }, { status: 201 })
  } catch (error) {
    console.error("Create betslip error:", error)
    return NextResponse.json({ error: "Failed to create betslip" }, { status: 500 })
  }
}
