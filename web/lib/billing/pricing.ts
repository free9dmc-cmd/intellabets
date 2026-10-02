/**
 * Single source of truth for what things cost and how the tipster split works.
 *
 * These used to live in lib/stripe.ts, which coupled pricing to one processor.
 * They are processor-agnostic facts, so they belong here; lib/stripe.ts now
 * re-exports them so existing imports keep working (DRY — one definition).
 */
import { PLATFORM_FEE } from "../utils"
import type { PlanId } from "./types"

/** Amounts are in cents (USD) to avoid floating-point money bugs. */
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
} satisfies Record<PlanId, { amount: number; interval: "month"; description: string }>

/** Price of a plan in cents. */
export function planAmountCents(plan: PlanId): number {
  return PRICING[plan].amount
}

/** Human-readable description of a plan, for processor order descriptions. */
export function planDescription(plan: PlanId): string {
  return PRICING[plan].description
}

/**
 * Split a gross subscriber payment into the platform fee and the tipster's net.
 * Used when recording Payout rows. Processor-agnostic.
 */
export function calcTipsterPayout(grossAmount: number) {
  const fee = grossAmount * PLATFORM_FEE
  const net = grossAmount - fee
  return { gross: grossAmount, fee, net }
}
