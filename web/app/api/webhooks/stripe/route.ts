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
          data: {
            isPremium: true,
            premiumSince: new Date(),
            premiumUntil: until,
            // Record the backing subscription so renewals can extend it and
            // cancellation can revoke it.
            premiumStripeSubId: (session.subscription as string) ?? null,
            stripeCustomerId: (session.customer as string) ?? undefined,
          },
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

    // RENEWALS. Stripe fires invoice.payment_succeeded each billing cycle, NOT
    // checkout.session.completed. Without this, expiresAt/premiumUntil is set
    // once at purchase and never extended — so from month 2 the customer keeps
    // being charged while the app denies them access.
    case "invoice.paid":
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as {
        subscription?: string | null
        billing_reason?: string | null
        subscription_details?: { metadata?: Record<string, string> | null } | null
      }
      const subId = invoice.subscription ?? null
      // The first invoice is already handled by checkout.session.completed.
      if (!subId || invoice.billing_reason === "subscription_create") break

      const until = new Date()
      until.setMonth(until.getMonth() + 1)

      // Extend whichever record this subscription backs.
      await prisma.subscription.updateMany({
        where: { stripeSubId: subId },
        data: { status: "active", expiresAt: until },
      })
      await prisma.aISubscription.updateMany({
        where: { stripeSubId: subId },
        data: { status: "active", expiresAt: until },
      })
      await prisma.user.updateMany({
        where: { premiumStripeSubId: subId },
        data: { isPremium: true, premiumUntil: until },
      })
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
      // Premium was previously NOT revoked here — a cancelled premium
      // subscription left isPremium true until premiumUntil lapsed.
      await prisma.user.updateMany({
        where: { premiumStripeSubId: sub.id },
        data: { isPremium: false, premiumStripeSubId: null },
      })
      break
    }
  }

  return NextResponse.json({ received: true })
}
