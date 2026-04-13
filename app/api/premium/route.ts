import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// In production this would create a Stripe checkout session
// For now we simulate the upgrade flow
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { type } = await req.json() // "premium" | "ai"

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  if (type === "premium") {
    if (user.isPremium && user.premiumUntil && user.premiumUntil > new Date()) {
      return NextResponse.json({ error: "Already a premium member" }, { status: 409 })
    }

    const premiumUntil = new Date()
    premiumUntil.setMonth(premiumUntil.getMonth() + 1)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isPremium: true,
        premiumSince: user.premiumSince ?? new Date(),
        premiumUntil,
      },
    })

    return NextResponse.json({
      message: "Premium membership activated",
      premiumUntil,
    })
  }

  if (type === "ai") {
    const existing = await prisma.aISubscription.findUnique({ where: { userId: user.id } })

    const expiresAt = new Date()
    expiresAt.setMonth(expiresAt.getMonth() + 1)

    if (existing) {
      await prisma.aISubscription.update({
        where: { userId: user.id },
        data: { status: "active", expiresAt },
      })
    } else {
      await prisma.aISubscription.create({
        data: { userId: user.id, status: "active", expiresAt },
      })
    }

    return NextResponse.json({ message: "AI subscription activated", expiresAt })
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 })
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { aiSubscription: true },
  })

  return NextResponse.json({
    isPremium: user?.isPremium ?? false,
    premiumUntil: user?.premiumUntil,
    hasAI: user?.aiSubscription?.status === "active" && (user.aiSubscription.expiresAt > new Date()),
    aiExpiresAt: user?.aiSubscription?.expiresAt,
  })
}
