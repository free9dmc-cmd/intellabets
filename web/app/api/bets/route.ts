import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Bets the user placed at their own sportsbook.
 *
 * IntellaBets never places a bet. This records what the user reports doing so
 * their real results can be tracked against what was recommended — which is
 * also the only honest way to show whether following the picks worked.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const bets = await prisma.placedBet.findMany({
    where: { userId: session.user.id },
    orderBy: { placedAt: "desc" },
    take: 200,
  })

  const settled = bets.filter((b) => ["won", "lost", "push"].includes(b.status))
  const decided = settled.filter((b) => b.status !== "push")
  const wins = settled.filter((b) => b.status === "won").length
  const losses = settled.filter((b) => b.status === "lost").length
  const staked = settled.reduce((s, b) => s + b.stake, 0)
  const profit = settled.reduce((s, b) => s + (b.profit ?? 0), 0)
  const pending = bets.filter((b) => b.status === "pending")

  // Profit per book, so a user can see where their results actually come from.
  const byBook: Record<string, { staked: number; profit: number; bets: number }> = {}
  for (const b of settled) {
    byBook[b.book] ??= { staked: 0, profit: 0, bets: 0 }
    byBook[b.book].staked += b.stake
    byBook[b.book].profit += b.profit ?? 0
    byBook[b.book].bets += 1
  }

  return NextResponse.json({
    bets,
    stats: {
      total: bets.length,
      pendingCount: pending.length,
      atRisk: Math.round(pending.reduce((s, b) => s + b.stake, 0) * 100) / 100,
      wins,
      losses,
      pushes: settled.length - decided.length,
      winRate: decided.length ? Math.round((wins / decided.length) * 1000) / 10 : 0,
      staked: Math.round(staked * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      // ROI on settled bets only — counting pending money would flatter it.
      roi: staked > 0 ? Math.round((profit / staked) * 1000) / 10 : 0,
      byBook,
    },
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const stake = Number(body.stake)
  const oddsDecimal = Number(body.oddsDecimal)
  if (!Number.isFinite(stake) || stake <= 0) {
    return NextResponse.json({ error: "stake must be a positive number" }, { status: 400 })
  }
  if (!Number.isFinite(oddsDecimal) || oddsDecimal <= 1) {
    return NextResponse.json({ error: "oddsDecimal must be greater than 1" }, { status: 400 })
  }
  if (!body.selection || !body.book) {
    return NextResponse.json({ error: "selection and book are required" }, { status: 400 })
  }

  const american = oddsDecimal >= 2
    ? `+${Math.round((oddsDecimal - 1) * 100)}`
    : `${Math.round(-100 / (oddsDecimal - 1))}`

  const bet = await prisma.placedBet.create({
    data: {
      userId: session.user.id,
      predictionId: typeof body.predictionId === "string" ? body.predictionId : null,
      matchup: String(body.matchup ?? "").slice(0, 200),
      sport: String(body.sport ?? "").slice(0, 40),
      book: String(body.book).slice(0, 40),
      selection: String(body.selection).slice(0, 200),
      marketType: String(body.marketType ?? "other").slice(0, 40),
      oddsDecimal,
      oddsAmerican: american,
      stake,
      potentialPayout: Math.round(stake * oddsDecimal * 100) / 100,
    },
  })

  return NextResponse.json({ bet }, { status: 201 })
}
