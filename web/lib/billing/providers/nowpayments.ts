/**
 * NOWPayments — custodial crypto rail.
 *
 * Checkout: create an invoice; the customer pays on NOWPayments' hosted page in
 * any supported coin and we get USD-denominated settlement. Each successful
 * payment grants ONE month (per-period rail — no recurring object).
 *
 * IPN verification: NOWPayments signs the IPN body with HMAC-SHA512 over the
 * JSON of the body with its keys RECURSIVELY SORTED alphabetically, keyed with
 * the IPN secret, and sends it in the `x-nowpayments-sig` header. Verified in
 * verifyNowpaymentsSignature (pure, unit-tested).
 *
 * Env is read lazily inside methods so importing this file never throws when
 * the keys are absent — the provider simply reports isConfigured() === false
 * and the app degrades to its clean 503.
 */
import { prisma } from "../../prisma"
import type { PaymentProvider } from "../provider"
import { readHeader, InvalidWebhookSignatureError } from "../provider"
import type { CheckoutInput, CheckoutResult, NormalizedEvent, PlanId } from "../types"
import { planAmountCents, planDescription } from "../pricing"
import { hmacHex, sortKeysDeep, timingSafeEqualStr } from "./crypto-utils"

function apiBase(): string {
  return process.env.NOWPAYMENTS_SANDBOX === "true"
    ? "https://api-sandbox.nowpayments.io/v1"
    : "https://api.nowpayments.io/v1"
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000"
}

/**
 * Pure signature check, exported for unit tests. Reproduces NOWPayments' scheme
 * exactly: parse the raw body, sort keys deeply, JSON.stringify, HMAC-SHA512
 * with the IPN secret, constant-time compare against the header.
 */
export function verifyNowpaymentsSignature(
  rawBody: string,
  signature: string | null,
  ipnSecret: string
): boolean {
  if (!signature || !ipnSecret) return false
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return false
  }
  const sorted = JSON.stringify(sortKeysDeep(parsed))
  const expected = hmacHex("sha512", ipnSecret, sorted)
  return timingSafeEqualStr(expected, signature.trim())
}

export const nowpaymentsProvider: PaymentProvider = {
  id: "nowpayments",
  label: "Crypto (NOWPayments)",

  isConfigured() {
    return Boolean(process.env.NOWPAYMENTS_API_KEY)
  },

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const apiKey = process.env.NOWPAYMENTS_API_KEY
    if (!apiKey) return { kind: "unsupported", reason: "NOWPayments not configured" }

    const amountCents = planAmountCents(input.plan)

    // Pin the order server-side first so the IPN maps back to a user + plan
    // without trusting anything in the callback body beyond its id.
    const order = await prisma.paymentOrder.create({
      data: {
        provider: "nowpayments",
        plan: input.plan,
        userId: input.userId,
        expectedAmount: String(amountCents),
        currency: "usd",
      },
    })

    const res = await fetch(`${apiBase()}/invoice`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        price_amount: amountCents / 100,
        price_currency: "usd",
        order_id: order.id,
        order_description: planDescription(input.plan),
        ipn_callback_url: `${appUrl()}/api/webhooks/nowpayments`,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`NOWPayments invoice failed: ${res.status} ${text}`)
    }

    const data = (await res.json()) as { invoice_url?: string }
    if (!data.invoice_url) throw new Error("NOWPayments invoice returned no invoice_url")
    return { kind: "redirect", url: data.invoice_url }
  },

  // Crypto is per-period: there is no recurring subscription to cancel. Access
  // simply lapses when the paid month ends.
  async cancelSubscription(): Promise<{ ok: boolean }> {
    return { ok: true }
  },

  async verifyWebhook(
    rawBody: string,
    headers: Headers | Record<string, string>
  ): Promise<NormalizedEvent | null> {
    const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET
    const signature = readHeader(headers, "x-nowpayments-sig")
    if (!ipnSecret || !verifyNowpaymentsSignature(rawBody, signature, ipnSecret)) {
      throw new InvalidWebhookSignatureError()
    }

    const body = JSON.parse(rawBody) as {
      payment_id?: string | number
      payment_status?: string
      order_id?: string
      price_amount?: number
      pay_currency?: string
    }

    // Only a settled payment grants access.
    if (body.payment_status !== "finished" && body.payment_status !== "confirmed") {
      return null
    }

    const order = body.order_id
      ? await prisma.paymentOrder.findUnique({ where: { id: body.order_id } })
      : null
    if (!order || order.provider !== "nowpayments") return null

    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: "paid", paidAt: new Date() },
    })

    return {
      provider: "nowpayments",
      // payment_id is stable per payment; fall back to order id. This is the
      // idempotency key, so it must be stable across NOWPayments' retries.
      eventId: String(body.payment_id ?? order.id),
      type: `payment.${body.payment_status}`,
      action: "grant",
      plan: order.plan as PlanId,
      userId: order.userId,
      recurring: false,
      periodMonths: 1,
      raw: body,
    }
  },
}
