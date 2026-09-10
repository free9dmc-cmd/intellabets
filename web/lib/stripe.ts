import Stripe from "stripe"
import { PLATFORM_FEE } from "./utils"

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
  apiVersion: "2025-02-24.acacia",
})

export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY ?? ""
  return (key.startsWith("sk_test_") || key.startsWith("sk_live_")) && key.length > 30
}

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
    subscription_data: { metadata: { userId, type: "premium" } },
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
    subscription_data: { metadata: { userId, type: "ai_subscription" } },
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
    subscription_data: { metadata: { subscriberId, tipsterId, type: "tipster_subscription" } },
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

/**
 * Cancel a Stripe subscription at the end of the paid period.
 *
 * Cancelling in-app previously only flipped a DB status flag, so Stripe kept
 * charging the customer every month after they "cancelled" — the fastest route
 * to chargebacks and a Stripe risk review.
 *
 * We cancel at period end (not immediately) so the customer keeps the access
 * they already paid for; the `customer.subscription.deleted` webhook then
 * revokes it when the period actually lapses.
 *
 * Returns true if Stripe accepted the cancellation.
 */
export async function cancelStripeSubscription(stripeSubId: string | null | undefined): Promise<boolean> {
  if (!stripeSubId || !isStripeConfigured()) return false
  try {
    await stripe.subscriptions.update(stripeSubId, { cancel_at_period_end: true })
    return true
  } catch (err) {
    console.error("Failed to cancel Stripe subscription", stripeSubId, err)
    return false
  }
}

// ─── Stripe Connect: paying tipsters ─────────────────────────────────────────
//
// Subscribers pay the platform, and the platform owes each tipster 80% of what
// their subscribers paid. Moving that money to a third party requires Stripe
// Connect — plain Stripe can only take payments in. Express accounts let Stripe
// handle the tipster's identity verification, bank details and 1099 issuance.

/** Create (or reuse) a Connect Express account for a tipster. Returns its id. */
export async function ensureConnectAccount(params: {
  existingAccountId?: string | null
  email: string
}): Promise<string> {
  if (params.existingAccountId) return params.existingAccountId
  const account = await stripe.accounts.create({
    type: "express",
    email: params.email,
    capabilities: { transfers: { requested: true } },
    business_type: "individual",
  })
  return account.id
}

/** Hosted onboarding link where the tipster enters identity + bank details. */
export async function createConnectOnboardingLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string
): Promise<string> {
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  })
  return link.url
}

/** True once Stripe has verified the account and enabled payouts to it. */
export async function connectPayoutsEnabled(accountId: string): Promise<boolean> {
  try {
    const account = await stripe.accounts.retrieve(accountId)
    return Boolean(account.payouts_enabled && account.charges_enabled !== false)
  } catch (err) {
    console.error("Failed to retrieve Connect account", accountId, err)
    return false
  }
}

/**
 * Transfer earnings to a tipster's connected account.
 * @param amountUsd net amount owed (already has the platform fee removed)
 * @param idempotencyKey stable key so a retried withdrawal cannot pay twice
 */
export async function transferToTipster(params: {
  accountId: string
  amountUsd: number
  idempotencyKey: string
  description?: string
}): Promise<{ ok: true; transferId: string } | { ok: false; error: string }> {
  try {
    const transfer = await stripe.transfers.create(
      {
        amount: Math.round(params.amountUsd * 100),
        currency: "usd",
        destination: params.accountId,
        description: params.description ?? "IntellaBets tipster payout",
      },
      { idempotencyKey: params.idempotencyKey }
    )
    return { ok: true, transferId: transfer.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transfer failed"
    console.error("Stripe transfer failed", params.accountId, err)
    return { ok: false, error: message }
  }
}
