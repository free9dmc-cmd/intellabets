/**
 * Shared, processor-agnostic billing types.
 *
 * The whole point of this layer is that the rest of the app talks to ONE
 * `PaymentProvider` interface and never to Stripe / Authorize.Net / NOWPayments
 * / a wallet directly. Everything a provider emits is funnelled through a
 * `NormalizedEvent`, which `applyBillingEvent` (events.ts) is the single place
 * allowed to turn into granted entitlements.
 */

/** The two first-party subscription products. Tipster subs are handled separately. */
export type PlanId = "premium" | "ai"

/** Stable ids for the payment rails behind the `PaymentProvider` interface. */
export type ProviderId = "authorizenet" | "nowpayments" | "web3"

/** What the checkout route hands a provider to start a payment. */
export interface CheckoutInput {
  plan: PlanId
  userId: string
  /** The authenticated user's email — some rails want it for receipts/profiles. */
  userEmail?: string | null
  /** Absolute URL the processor returns to on success. */
  successUrl: string
  /** Absolute URL the processor returns to on cancel. */
  cancelUrl: string
  /**
   * web3 only: the wallet the user has connected in the browser. When supplied
   * we pin the order to it, so only a transfer FROM that address can settle it.
   */
  walletAddress?: string | null
}

/**
 * The result of starting a checkout. A discriminated union so the caller is
 * forced to handle each rail's shape explicitly:
 *   - `redirect` — send the browser to a hosted payment page (card / crypto).
 *   - `wallet`   — the browser must do an on-chain token transfer itself
 *                  (self-custody web3), then confirm the tx hash with us.
 *   - `unsupported` — this provider can't service this request right now.
 */
export type CheckoutResult =
  | { kind: "redirect"; url: string }
  | {
      kind: "wallet"
      chainId: number
      /** ERC-20 token contract to transfer (USDC), lowercased. */
      tokenAddress: string
      /** Amount in token base units, as a decimal string (USDC = 6 decimals). */
      amount: string
      /** Single receiving address the user must pay, lowercased. */
      recipient: string
      /** Our server-side order id; echoed back to the confirm route. */
      orderId: string
      /** Token decimals, so the client can render a human amount. */
      decimals: number
    }
  | { kind: "unsupported"; reason: string }

/**
 * A processor event, normalised to the only facts the entitlement writer cares
 * about. Producing one of these from a signed webhook / verified tx is each
 * provider's job; acting on it is exclusively `applyBillingEvent`'s.
 */
export interface NormalizedEvent {
  /** Which rail produced it — also the first half of the idempotency key. */
  provider: ProviderId
  /**
   * A stable id unique per logical event, used for idempotency. For webhooks
   * this is the processor's event/notification id; for web3 it is the tx hash.
   */
  eventId: string
  /** The processor's own event type string, kept for logging/audit. */
  type: string
  /** grant = extend/enable access; revoke = cancel it. */
  action: "grant" | "revoke"
  /** Which product this affects. */
  plan: PlanId
  /** The IntellaBets user this applies to. */
  userId: string
  /**
   * Recurring rails (card / Authorize.Net ARB) manage renewals themselves, so a
   * grant extends to a fixed period and a later cancel revokes. Per-period rails
   * (crypto / web3) are false: each grant simply adds `periodMonths` of access.
   */
  recurring: boolean
  /** Months of access this grant confers (per-period rails). Default 1. */
  periodMonths?: number
  /** The provider's subscription id for recurring rails; null otherwise. */
  providerSubId?: string | null
  /** The raw payload, for debugging/audit only — never trusted for grants. */
  raw?: unknown
}

/** Outcome of a cancel request against a provider's recurring subscription. */
export interface CancelResult {
  ok: boolean
  error?: string
}
