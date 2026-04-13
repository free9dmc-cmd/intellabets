import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const betslip = await prisma.betslip.findUnique({
    where: { id: params.id },
    include: { bets: true },
  })

  if (!betslip) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (betslip.userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (betslip.status !== "pending") {
    return NextResponse.json({ error: "Betslip already settled" }, { status: 400 })
  }

  const { result, betResults } = await req.json()
  // result: "won" | "lost" | "push"
  // betResults: { [betId]: "won" | "lost" | "push" }

  const profitLoss =
    result === "won"
      ? betslip.potentialReturn - betslip.stake
      : result === "push"
      ? 0
      : -betslip.stake

  // Update each individual bet result
  if (betResults) {
    for (const [betId, betResult] of Object.entries(betResults)) {
      await prisma.bet.update({
        where: { id: betId },
        data: { result: betResult as string },
      })
    }
  }

  const updatedBetslip = await prisma.betslip.update({
    where: { id: params.id },
    data: { status: result, profitLoss, settledAt: new Date() },
  })

  // Update user stats
  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (user) {
    const newWins = result === "won" ? user.totalWins + 1 : user.totalWins
    const newLosses = result === "lost" ? user.totalLosses + 1 : user.totalLosses
    const newPushes = result === "push" ? user.totalPushes + 1 : user.totalPushes
    const total = newWins + newLosses
    const winRate = total > 0 ? newWins / total : 0

    // Calculate ROI from all settled betslips
    const settled = await prisma.betslip.findMany({
      where: { userId: user.id, status: { in: ["won", "lost", "push"] } },
    })
    const totalStake = settled.reduce((s, b) => s + b.stake, 0)
    const totalProfit = settled.reduce((s, b) => s + b.profitLoss, 0)
    const roi = totalStake > 0 ? (totalProfit / totalStake) * 100 : 0

    await prisma.user.update({
      where: { id: user.id },
      data: { totalWins: newWins, totalLosses: newLosses, totalPushes: newPushes, winRate, roi },
    })
  }

  return NextResponse.json({ betslip: updatedBetslip })
}
