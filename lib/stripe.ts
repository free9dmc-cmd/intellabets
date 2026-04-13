import Stripe from "stripe"
import { PLATFORM_FEE } from "./utils"

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
  apiVersion: "2025-02-24.acacia",
})

export const PRICING = {
  premium: {
    amount: 1999, // $19.99/mo
    interval: "month" as const,
    description: "IntellaBets Premium Tipster Membership",
  },
  ai: {
    amount: 999, // $9.99/mo
    interval: "month" as const,
    description: "IntellaBets AI Picks Subscription",
  },
}

/**
 * Create a Stripe Checkout session for premium membership
 */
export async function createPremiumCheckout(userId: string, successUrl: string, cancelUrl: string) {
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "Premium Tipster Membership" },
          unit_amount: PRICING.premium.amount,
          recurring: { interval: PRICING.premium.interval },
        },
        quantity: 1,
      },
    ],
    metadata: { userId, type: "premium" },
    success_url: successUrl,
    cancel_url: cancelUrl,
  })
  return session
}

/**
 * Create a Stripe Checkout session for AI subscription
 */
export async function createAICheckout(userId: string, successUrl: string, cancelUrl: string) {
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "AI Picks Monthly Subscription" },
          unit_amount: PRICING.ai.amount,
          recurring: { interval: PRICING.ai.interval },
        },
        quantity: 1,
      },
    ],
    metadata: { userId, type: "ai_subscription" },
    success_url: successUrl,
    cancel_url: cancelUrl,
  })
  return session
}

/**
 * Create a Stripe Checkout session for subscribing to a tipster
 */
export async function createTipsterCheckout(
  subscriberId: string,
  tipsterId: string,
  priceMonthly: number,
  tipsterName: string,
  successUrl: string,
  cancelUrl: string
) {
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: `${tipsterName} Betslip Subscription` },
          unit_amount: Math.round(priceMonthly * 100),
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    metadata: { subscriberId, tipsterId, type: "tipster_subscription" },
    success_url: successUrl,
    cancel_url: cancelUrl,
  })
  return session
}

/**
 * Calculate tipster payout after platform fee
 */
export function calcTipsterPayout(grossAmount: number) {
  const fee = grossAmount * PLATFORM_FEE
  const net = grossAmount - fee
  return { gross: grossAmount, fee, net }
}
