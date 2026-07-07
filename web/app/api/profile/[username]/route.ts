import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: { username: string } }) {
  const session = await getServerSession(authOptions)

  const user = await prisma.user.findUnique({
    where: { username: params.username.toLowerCase() },
    select: {
      id: true,
      username: true,
      name: true,
      image: true,
      bio: true,
      specialties: true,
      subscriptionPrice: true,
      isPremium: true,
      isVerified: true,
      totalWins: true,
      totalLosses: true,
      totalPushes: true,
      winRate: true,
      roi: true,
      subscriberCount: true,
      totalEarnings: true,
      createdAt: true,
    },
  })

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  let isSubscribed = false
  let isOwner = false

  if (session?.user) {
    isOwner = session.user.id === user.id
    if (!isOwner) {
      const sub = await prisma.subscription.findUnique({
        where: {
          subscriberId_tipsterId: { subscriberId: session.user.id, tipsterId: user.id },
        },
      })
      isSubscribed = sub?.status === "active" && (sub.expiresAt > new Date())
    }
  }

  // Get recent betslips (public ones, or all if subscribed/owner)
  const betslipsWhere: Record<string, unknown> = {
    userId: user.id,
    ...(isOwner || isSubscribed ? {} : { isPublic: true }),
  }

  const betslips = await prisma.betslip.findMany({
    where: betslipsWhere,
    include: { bets: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  return NextResponse.json({ user, betslips, isSubscribed, isOwner })
}

export async function PATCH(req: Request, { params }: { params: { username: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { username: params.username } })
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (user.id !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { bio, specialties, subscriptionPrice } = await req.json()

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(bio !== undefined && { bio }),
      ...(specialties !== undefined && { specialties }),
      ...(subscriptionPrice !== undefined && {
        subscriptionPrice: Math.max(4.99, Math.min(49.99, subscriptionPrice)),
      }),
    },
    select: {
      id: true, username: true, name: true, bio: true,
      specialties: true, subscriptionPrice: true,
    },
  })

  return NextResponse.json({ user: updated })
}
