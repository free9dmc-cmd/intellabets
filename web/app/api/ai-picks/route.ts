import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateAIBetslip } from "@/lib/ai"
import { hasAIAccess } from "@/lib/entitlements"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // AI Picks is unlocked by a standalone AI subscription OR by an active
  // Premium membership (Premium bundles AI Picks). Checked against the DB, not
  // the JWT, so a lapsed membership can't ride a stale token.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      isPremium: true,
      premiumUntil: true,
      aiSubscription: { select: { status: true, expiresAt: true } },
    },
  })

  if (!hasAIAccess(user)) {
    return NextResponse.json(
      { error: "AI Picks subscription or Premium membership required", code: "NO_AI_SUB" },
      { status: 403 }
    )
  }

  const { sport, betType, riskLevel } = await req.json()

  if (!sport || !betType || !riskLevel) {
    return NextResponse.json({ error: "sport, betType, and riskLevel are required" }, { status: 400 })
  }

  try {
    const betslip = await generateAIBetslip(sport, betType, riskLevel)
    return NextResponse.json({ betslip })
  } catch (error) {
    console.error("AI generation error:", error)
    return NextResponse.json({ error: "AI generation failed, please try again" }, { status: 500 })
  }
}
