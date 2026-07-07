import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateAIBetslip } from "@/lib/ai"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Check AI subscription
  const aiSub = await prisma.aISubscription.findUnique({
    where: { userId: session.user.id },
  })

  if (!aiSub || aiSub.status !== "active" || aiSub.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "AI Picks subscription required", code: "NO_AI_SUB" },
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
