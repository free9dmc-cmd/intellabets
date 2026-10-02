/**
 * The one interface every payment rail implements.
 *
 * Adding a new processor means writing a new object that satisfies this — the
 * routes, the registry and the entitlement writer never change. Each method is
 * allowed to read its own env lazily and MUST NOT throw at import time when its
 * env is missing (see isConfigured): a missing processor degrades to the clean
 * 503 the app already has, it does not crash the build or the request.
 */
import type {
  CancelResult,
  CheckoutInput,
  CheckoutResult,
  NormalizedEvent,
  ProviderId,
} from "./types"

export interface PaymentProvider {
  /** Stable id, also the first half of every idempotency key for this rail. */
  readonly id: ProviderId
  /** Human label for the checkout picker UI. */
  readonly label: string

  /**
   * True only when every env var this provider needs is present and well-formed.
   * Read lazily (never cached at module scope) so rotating a key in and out
   * flips the provider on/off without a redeploy.
   */
  isConfigured(): boolean

  /** Begin a payment. Returns a redirect URL, wallet params, or `unsupported`. */
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>

  /**
   * Cancel a recurring subscription (card / ARB). Per-period rails (crypto /
   * web3) have no recurring object to cancel and return { ok: true }.
   */
  cancelSubscription(providerSubId: string): Promise<CancelResult>

  /**
   * Verify an inbound webhook and normalise it.
   *   - THROWS InvalidWebhookSignatureError when the signature is missing or
   *     does not verify (caller replies 400). Separated from the null case so a
   *     forged request is loud, while an ignored-but-genuine event is quiet.
   *   - returns null when the signature is valid but the event is one we don't
   *     act on, or is non-terminal (caller replies 200 and does nothing, so the
   *     processor doesn't retry it forever).
   *   - returns a NormalizedEvent when the signature is valid AND actionable.
   * The caller passes the RAW request body string (never a re-serialised parse)
   * so signatures computed over exact bytes verify correctly.
   */
  verifyWebhook(
    rawBody: string,
    headers: Headers | Record<string, string>
  ): Promise<NormalizedEvent | null>

  /**
   * web3 only: confirm an on-chain payment against a server-created order.
   * Returns a NormalizedEvent only when the transaction provably settled the
   * expected token / recipient / amount (and from-address if the order pinned
   * one) with enough confirmations; null otherwise. Never grants on doubt.
   */
  verifyOnChainPayment?(
    txHash: string,
    orderId: string
  ): Promise<NormalizedEvent | null>
}

/**
 * Thrown by verifyWebhook when a webhook's signature is missing or invalid.
 * The webhook routes map this to an HTTP 400 so forged/misconfigured calls are
 * rejected loudly, distinct from genuine events we simply don't act on.
 */
export class InvalidWebhookSignatureError extends Error {
  constructor(message = "Invalid webhook signature") {
    super(message)
    this.name = "InvalidWebhookSignatureError"
  }
}

/** Read a header case-insensitively from either a Headers or a plain object. */
export function readHeader(
  headers: Headers | Record<string, string>,
  name: string
): string | null {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name)
  }
  const lower = name.toLowerCase()
  const obj = headers as Record<string, string>
  for (const key of Object.keys(obj)) {
    if (key.toLowerCase() === lower) return obj[key]
  }
  return null
}
