import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { calcTipsterPayout } from "@/lib/stripe"

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get("stripe-signature")

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error("Webhook signature failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object
      const { userId, type, subscriberId, tipsterId } = session.metadata ?? {}

      if (type === "premium" && userId) {
        const until = new Date()
        until.setMonth(until.getMonth() + 1)
        await prisma.user.update({
          where: { id: userId },
          data: { isPremium: true, premiumSince: new Date(), premiumUntil: until },
        })
      }

      if (type === "ai_subscription" && userId) {
        const expiresAt = new Date()
        expiresAt.setMonth(expiresAt.getMonth() + 1)
        const existing = await prisma.aISubscription.findUnique({ where: { userId } })
        if (existing) {
          await prisma.aISubscription.update({
            where: { userId },
            data: { status: "active", stripeSubId: session.subscription as string, expiresAt },
          })
        } else {
          await prisma.aISubscription.create({
            data: {
              userId,
              status: "active",
              stripeSubId: session.subscription as string,
              expiresAt,
            },
          })
        }
      }

      if (type === "tipster_subscription" && subscriberId && tipsterId) {
        const tipster = await prisma.user.findUnique({ where: { id: tipsterId } })
        if (tipster) {
          const expiresAt = new Date()
          expiresAt.setMonth(expiresAt.getMonth() + 1)
          const existing = await prisma.subscription.findUnique({
            where: { subscriberId_tipsterId: { subscriberId, tipsterId } },
          })
          if (existing) {
            await prisma.subscription.update({
              where: { id: existing.id },
              data: {
                status: "active",
                stripeSubId: session.subscription as string,
                expiresAt,
              },
            })
          } else {
            await prisma.subscription.create({
              data: {
                subscriberId,
                tipsterId,
                price: tipster.subscriptionPrice,
                stripeSubId: session.subscription as string,
                expiresAt,
              },
            })
          }

          // Calculate and record payout for tipster
          const { fee, net } = calcTipsterPayout(tipster.subscriptionPrice)
          const period = new Date().toISOString().slice(0, 7)
          await prisma.payout.create({
            data: {
              userId: tipsterId,
              amount: tipster.subscriptionPrice,
              fee,
              netAmount: net,
              period,
              status: "pending",
            },
          })
          await prisma.user.update({
            where: { id: tipsterId },
            data: { subscriberCount: { increment: 1 } },
          })
        }
      }
      break
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object
      await prisma.subscription.updateMany({
        where: { stripeSubId: sub.id },
        data: { status: "cancelled" },
      })
      await prisma.aISubscription.updateMany({
        where: { stripeSubId: sub.id },
        data: { status: "cancelled" },
      })
      break
    }
  }

  return NextResponse.json({ received: true })
}
