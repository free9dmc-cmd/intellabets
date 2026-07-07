import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)

  const betslip = await prisma.betslip.findUnique({
    where: { id: params.id },
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
          bio: true,
          subscriberCount: true,
        },
      },
    },
  })

  if (!betslip) return NextResponse.json({ error: "Betslip not found" }, { status: 404 })

  // Public betslips are visible to all
  if (betslip.isPublic) return NextResponse.json({ betslip })

  // Private betslips: owner can always see
  if (session?.user?.id === betslip.userId) return NextResponse.json({ betslip })

  // Check if subscriber
  if (session?.user?.id) {
    const subscription = await prisma.subscription.findUnique({
      where: {
        subscriberId_tipsterId: {
          subscriberId: session.user.id,
          tipsterId: betslip.userId,
        },
      },
    })

    if (subscription?.status === "active" && subscription.expiresAt > new Date()) {
      return NextResponse.json({ betslip })
    }
  }

  return NextResponse.json({ error: "Subscribe to access this betslip" }, { status: 403 })
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const betslip = await prisma.betslip.findUnique({ where: { id: params.id } })
  if (!betslip) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (betslip.userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  await prisma.betslip.delete({ where: { id: params.id } })
  return NextResponse.json({ message: "Deleted" })
}
