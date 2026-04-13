import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type") // "mine" (as subscriber) or "tipster" (my subscribers)

  if (type === "tipster") {
    const subs = await prisma.subscription.findMany({
      where: { tipsterId: session.user.id, status: "active" },
      include: {
        subscriber: { select: { id: true, username: true, name: true, image: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json({ subscriptions: subs })
  }

  const subs = await prisma.subscription.findMany({
    where: { subscriberId: session.user.id },
    include: {
      tipster: {
        select: {
          id: true, username: true, name: true, image: true,
          winRate: true, isPremium: true, isVerified: true,
          totalWins: true, totalLosses: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json({ subscriptions: subs })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { tipsterId } = await req.json()
  if (!tipsterId) return NextResponse.json({ error: "tipsterId required" }, { status: 400 })

  if (tipsterId === session.user.id) {
    return NextResponse.json({ error: "Cannot subscribe to yourself" }, { status: 400 })
  }

  const tipster = await prisma.user.findUnique({ where: { id: tipsterId } })
  if (!tipster?.isPremium) {
    return NextResponse.json({ error: "User is not a premium tipster" }, { status: 400 })
  }

  // Check existing subscription
  const existing = await prisma.subscription.findUnique({
    where: { subscriberId_tipsterId: { subscriberId: session.user.id, tipsterId } },
  })

  if (existing?.status === "active" && existing.expiresAt > new Date()) {
    return NextResponse.json({ error: "Already subscribed" }, { status: 409 })
  }

  const expiresAt = new Date()
  expiresAt.setMonth(expiresAt.getMonth() + 1)

  const subscription = existing
    ? await prisma.subscription.update({
        where: { id: existing.id },
        data: { status: "active", price: tipster.subscriptionPrice, expiresAt },
      })
    : await prisma.subscription.create({
        data: {
          subscriberId: session.user.id,
          tipsterId,
          price: tipster.subscriptionPrice,
          expiresAt,
        },
      })

  // Update tipster subscriber count
  const activeCount = await prisma.subscription.count({
    where: { tipsterId, status: "active", expiresAt: { gt: new Date() } },
  })
  await prisma.user.update({ where: { id: tipsterId }, data: { subscriberCount: activeCount } })

  return NextResponse.json({ subscription }, { status: 201 })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const tipsterId = searchParams.get("tipsterId")
  if (!tipsterId) return NextResponse.json({ error: "tipsterId required" }, { status: 400 })

  await prisma.subscription.updateMany({
    where: { subscriberId: session.user.id, tipsterId },
    data: { status: "cancelled" },
  })

  const activeCount = await prisma.subscription.count({
    where: { tipsterId, status: "active", expiresAt: { gt: new Date() } },
  })
  await prisma.user.update({ where: { id: tipsterId }, data: { subscriberCount: activeCount } })

  return NextResponse.json({ message: "Unsubscribed" })
}
