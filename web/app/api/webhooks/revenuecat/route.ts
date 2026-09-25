import { timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { calcTipsterPayout } from "@/lib/stripe"

function priceFromTipsterProductId(productId: string): number {
  const match = productId.match(/tipster_(\d+)$/)
  return match ? parseInt(match[1]) / 100 : 9.99
}

const PRODUCT_TYPE: Record<string, "premium" | "ai"> = {
  "com.intellabets.premium": "premium",
  "com.intellabets.ai": "ai",
}

// RevenueCat sends the dashboard's "Authorization header value" verbatim, with
// no Bearer prefix of its own, so accept the secret with or without one.
function isAuthorized(header: string, secret: string): boolean {
  const got = Buffer.from(header)
  return [secret, `Bearer ${secret}`].some((expected) => {
    const want = Buffer.from(expected)
    return got.length === want.length && timingSafeEqual(got, want)
  })
}

function oneMonthFromNow() {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d
}

export async function POST(req: Request) {
  // Fail closed: with no secret configured, anyone could POST a purchase event
  // and grant any user premium, AI access or tipster earnings for free.
  const secret = (process.env.REVENUECAT_WEBHOOK_SECRET ?? "").trim()
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })
  }
  if (!isAuthorized(req.headers.get("authorization") ?? "", secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const event = body?.event
  if (!event) return NextResponse.json({ ok: true })

  const { type, app_user_id: userId, product_id: productId, subscriber_attributes } = event
  if (!userId || !productId) return NextResponse.json({ ok: true })

  const subType = PRODUCT_TYPE[productId]
  const isTipster = productId.startsWith("com.intellabets.tipster_")

  if (type === "INITIAL_PURCHASE" || type === "RENEWAL" || type === "UNCANCELLATION") {
    if (subType === "premium") {
      await prisma.user.update({
        where: { id: userId },
        data: { isPremium: true, premiumSince: new Date(), premiumUntil: oneMonthFromNow() },
      })
    } else if (subType === "ai") {
      await prisma.aISubscription.upsert({
        where: { userId },
        create: { userId, status: "active", expiresAt: oneMonthFromNow() },
        update: { status: "active", expiresAt: oneMonthFromNow() },
      })
    } else if (isTipster) {
      const tipsterId = subscriber_attributes?.tipster_id?.value as string | undefined
      if (tipsterId) {
        const price = priceFromTipsterProductId(productId)
        await prisma.subscription.upsert({
          where: { subscriberId_tipsterId: { subscriberId: userId, tipsterId } },
          create: {
            subscriberId: userId,
            tipsterId,
            price,
            status: "active",
            expiresAt: oneMonthFromNow(),
          },
          update: { status: "active", expiresAt: oneMonthFromNow() },
        })

        // Record platform fee payout for tipster
        if (type === "INITIAL_PURCHASE" || type === "RENEWAL") {
          const { net, fee } = calcTipsterPayout(price)
          const period = new Date().toISOString().slice(0, 7)
          await prisma.payout.create({
            data: {
              userId: tipsterId,
              amount: price,
              fee,
              netAmount: net,
              period,
              status: "pending",
            },
          })
          // Update tipster aggregate earnings
          await prisma.user.update({
            where: { id: tipsterId },
            data: { totalEarnings: { increment: net } },
          })
        }
      }
    }
  }

  if (type === "CANCELLATION" || type === "EXPIRATION") {
    if (subType === "ai") {
      await prisma.aISubscription.updateMany({
        where: { userId, status: "active" },
        data: { status: "cancelled" },
      })
    } else if (subType === "premium") {
      // Keep isPremium true until period ends; set premiumUntil to now so next check expires it
      await prisma.user.updateMany({
        where: { id: userId },
        data: { premiumUntil: new Date() },
      })
    } else if (isTipster) {
      const tipsterId = subscriber_attributes?.tipster_id?.value as string | undefined
      if (tipsterId) {
        await prisma.subscription.updateMany({
          where: { subscriberId: userId, tipsterId, status: "active" },
          data: { status: "cancelled" },
        })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
