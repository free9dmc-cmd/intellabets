import {
  PLATFORM_FEE_PERCENT,
  REFUND_WINDOW_DAYS,
  SUPPORT_EMAIL_LINK,
  TIPSTER_SHARE_PERCENT,
  BRAND,
} from "./facts"
import type { RichTextSource } from "./types"

/**
 * Billing wording shared by the Terms of Service and the Support & Refunds
 * page. Payment underwriters compare the two; writing each promise once is
 * what keeps them identical.
 *
 * KNOWN GAP (tracked in docs/LAUNCH-PLAN.md, must close before taking money):
 * the promise below that access continues to the end of the paid period is
 * the intended policy, but today the tipster Unsubscribe button and RevenueCat
 * cancellations end access immediately, and Premium / AI Picks have no
 * self-serve cancel button. No one can be charged until a processor is live.
 */

export const CANCELLATION_ITEMS: readonly RichTextSource[] = [
  "**Subscriptions renew automatically every month** at the price shown at checkout until you cancel.",
  `**You can cancel at any time.** To cancel a tipster subscription, select Unsubscribe on that tipster's profile. To cancel Premium or AI Picks, email ${SUPPORT_EMAIL_LINK} from the email address on your account.`,
  "Cancelling stops future charges and takes effect at the end of the period you have already paid for. You keep access until then.",
  "If you subscribed through our iOS or Android app, cancel in your Apple or Google account settings.",
]

export const REFUND_ITEMS: readonly RichTextSource[] = [
  `If you were charged in error, charged after cancelling, or could not access what you paid for, email ${SUPPORT_EMAIL_LINK} within ${REFUND_WINDOW_DAYS} days of the charge and we will refund it in full.`,
  "Because analysis is delivered as soon as you subscribe, we do not otherwise refund a billing period that has already started. If something has gone wrong, contact us and we will make it right.",
  "Refunds for purchases made through our iOS or Android app must be requested from Apple or Google under their policies.",
  "If you dispute a charge with your bank instead of contacting us, we may suspend your account while the dispute is open.",
]

export const TIPSTER_EARNINGS_ITEMS: readonly RichTextSource[] = [
  `Tipsters earn ${TIPSTER_SHARE_PERCENT}% of each subscriber payment. ${BRAND} keeps ${PLATFORM_FEE_PERCENT}% as a platform fee. Refunded or charged-back payments may be deducted from earnings.`,
  "**Payouts are not available yet.** Your earnings are recorded on your payouts page. Before payouts begin, we will add our payout provider, the identity and bank verification it requires, and the minimum payout to our Terms of Service.",
  "You are responsible for any taxes on your earnings.",
]
