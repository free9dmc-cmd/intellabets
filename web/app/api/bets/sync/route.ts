import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getPredictionResults, isEngineConfigured } from "@/lib/engine"

/**
 * Grade the user's pending bets from the engine's settlement results.
 *
 * Grading rules live with the game data in the engine, so rather than
 * duplicating scores and settlement logic here we ask what happened to the
 * pick each bet was based on and mirror it. Bets not tied to a pick stay
 * pending — we have no basis to grade those.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isEngineConfigured()) {
    return NextResponse.json({ error: "Results are unavailable right now." }, { status: 503 })
  }

  const pending = await prisma.placedBet.findMany({
    where: { userId: session.user.id, status: "pending", predictionId: { not: null } },
    select: { id: true, predictionId: true, stake: true, oddsDecimal: true },
  })
  if (pending.length === 0) return NextResponse.json({ graded: 0 })

  const ids = Array.from(new Set(pending.map((b) => b.predictionId as string)))
  const data = await getPredictionResults(ids)
  if (!data) return NextResponse.json({ error: "Could not reach results service." }, { status: 502 })

  const byPrediction = new Map(data.results.map((r) => [r.predictionId, r]))
  let graded = 0

  for (const bet of pending) {
    const result = byPrediction.get(bet.predictionId as string)
    if (!result || !["won", "lost", "push"].includes(result.status)) continue

    // Payout convention: a win returns stake x odds; a push returns the stake;
    // a loss returns nothing. Profit is always payout minus stake.
    const actualPayout =
      result.status === "won"
        ? Math.round(bet.stake * bet.oddsDecimal * 100) / 100
        : result.status === "push"
          ? bet.stake
          : 0

    await prisma.placedBet.update({
      where: { id: bet.id },
      data: {
        status: result.status,
        actualPayout,
        profit: Math.round((actualPayout - bet.stake) * 100) / 100,
        settledAt: result.settledAt ? new Date(result.settledAt) : new Date(),
      },
    })
    graded++
  }

  return NextResponse.json({ graded })
}
