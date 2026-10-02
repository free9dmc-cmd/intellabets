/**
 * Authorize.Net — the CARD rail (the gateway behind "2Accept").
 *
 * Checkout uses Accept Hosted: we ask Authorize.Net for a one-time form token
 * and hand the browser to the hosted payment page, so card data never touches
 * our servers (PCI scope stays minimal). The hosted transaction is tagged with
 * our PaymentOrder id as its invoiceNumber, which the authcapture webhook echoes
 * back so we can grant the right user the right plan.
 *
 * Recurring billing is Authorize.Net ARB (ARBCreateSubscriptionRequest). The
 * first charge + grant is wired here; see the ARB SEAM note below for what is
 * intentionally left as a documented TODO.
 *
 * Webhook verification: Authorize.Net sends `X-ANET-Signature: sha512=<HEX>`,
 * an HMAC-SHA512 over the RAW request body keyed with the account's Signature
 * Key. Crucially the Signature Key is a HEX string and must be decoded to bytes
 * before use as the HMAC key (matches Authorize.Net's own sample code). Verified
 * in verifyAnetSignature (pure, unit-tested).
 *
 * NMI SEAM: NMI is a drop-in future fallback for this same CARD slot. It speaks
 * a different API (NMI Collect.js / three-step redirect) but fills the identical
 * PaymentProvider contract. To add it: create providers/nmi.ts implementing the
 * same interface and register it; the registry/routes/UI need no changes.
 *
 * Env is read lazily so importing this module never throws when keys are absent.
 */
import crypto from "crypto"
import { prisma } from "../../prisma"
import type { PaymentProvider } from "../provider"
import { readHeader, InvalidWebhookSignatureError } from "../provider"
import type {
  CancelResult,
  CheckoutInput,
  CheckoutResult,
  NormalizedEvent,
  PlanId,
} from "../types"
import { planAmountCents, planDescription } from "../pricing"
import { timingSafeEqualStr } from "./crypto-utils"

function isProd(): boolean {
  return process.env.AUTHNET_ENV === "production"
}

/** JSON API endpoint (sandbox vs production). */
function apiEndpoint(): string {
  return isProd()
    ? "https://api.authorize.net/xml/v1/request.api"
    : "https://apitest.authorize.net/xml/v1/request.api"
}

/** Accept Hosted payment page endpoint (sandbox vs production). */
function hostedPageEndpoint(): string {
  return isProd()
    ? "https://accept.authorize.net/payment/payment"
    : "https://test.authorize.net/payment/payment"
}

function auth() {
  return {
    name: process.env.AUTHNET_API_LOGIN_ID ?? "",
    transactionKey: process.env.AUTHNET_TRANSACTION_KEY ?? "",
  }
}

function configured(): boolean {
  return Boolean(process.env.AUTHNET_API_LOGIN_ID && process.env.AUTHNET_TRANSACTION_KEY)
}

/**
 * Pure signature check, exported for unit tests. Reproduces Authorize.Net's
 * scheme: strip the `sha512=` prefix, HMAC-SHA512 the RAW body with the
 * hex-decoded Signature Key, constant-time compare (case-insensitive hex).
 */
export function verifyAnetSignature(
  rawBody: string,
  header: string | null,
  signatureKey: string
): boolean {
  if (!header || !signatureKey) return false
  const provided = header.replace(/^sha512=/i, "").trim().toUpperCase()
  if (!provided) return false

  // The Signature Key is a hex string; it must be decoded to bytes for the HMAC.
  const keyBytes = /^[0-9a-fA-F]+$/.test(signatureKey) && signatureKey.length % 2 === 0
    ? Buffer.from(signatureKey, "hex")
    : Buffer.from(signatureKey, "utf8")

  const expected = crypto
    .createHmac("sha512", keyBytes)
    .update(rawBody, "utf8")
    .digest("hex")
    .toUpperCase()

  return timingSafeEqualStr(expected, provided)
}

interface AnetResponse {
  token?: string
  messages?: { resultCode?: string; message?: Array<{ code?: string; text?: string }> }
}

async function anetRequest(body: unknown): Promise<AnetResponse> {
  const res = await fetch(apiEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  // Authorize.Net's JSON responses are prefixed with a BOM; strip it before parse.
  const text = (await res.text()).replace(/^﻿/, "")
  return JSON.parse(text) as AnetResponse
}

export const authorizenetProvider: PaymentProvider = {
  id: "authorizenet",
  label: "Card (Authorize.Net)",

  isConfigured() {
    return configured()
  },

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    if (!configured()) return { kind: "unsupported", reason: "Authorize.Net not configured" }

    const amountCents = planAmountCents(input.plan)
    const amount = (amountCents / 100).toFixed(2)

    const order = await prisma.paymentOrder.create({
      data: {
        provider: "authorizenet",
        plan: input.plan,
        userId: input.userId,
        expectedAmount: String(amountCents),
        currency: "usd",
      },
    })

    // Authorize.Net caps invoiceNumber at 20 chars. Persist the EXACT value we
    // send so the authcapture webhook can match this order back exactly, instead
    // of by an id prefix (which could collide with another order's id).
    const invoiceNumber = order.id.slice(0, 20)
    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { invoiceNumber },
    })

    const returnOptions = JSON.stringify({
      showReceipt: true,
      url: input.successUrl,
      urlText: "Continue",
      cancelUrl: input.cancelUrl,
      cancelUrlText: "Cancel",
    })

    const resp = await anetRequest({
      getHostedPaymentPageRequest: {
        merchantAuthentication: auth(),
        transactionRequest: {
          transactionType: "authCaptureTransaction",
          amount,
          order: {
            invoiceNumber, // exact value persisted above (<=20 chars)
            description: planDescription(input.plan),
          },
          customer: input.userEmail ? { email: input.userEmail } : undefined,
        },
        hostedPaymentSettings: {
          setting: [
            { settingName: "hostedPaymentReturnOptions", settingValue: returnOptions },
            { settingName: "hostedPaymentButtonOptions", settingValue: JSON.stringify({ text: "Pay" }) },
            {
              settingName: "hostedPaymentOrderOptions",
              settingValue: JSON.stringify({ show: true, merchantName: "IntellaBets" }),
            },
          ],
        },
      },
    })

    if (resp.messages?.resultCode !== "Ok" || !resp.token) {
      const msg = resp.messages?.message?.[0]?.text ?? "unknown error"
      throw new Error(`Authorize.Net hosted page request failed: ${msg}`)
    }

    // Accept Hosted expects the token POSTed to the hosted page. The frontend
    // renders an auto-submitting form; we hand it the endpoint with the token so
    // it can do that (a plain GET redirect also works in sandbox). The token is
    // single-use and short-lived.
    const url = `${hostedPageEndpoint()}?token=${encodeURIComponent(resp.token)}`
    return { kind: "redirect", url }

    // ── ARB SEAM ──────────────────────────────────────────────────────────────
    // For true card RECURRING billing, after the first hosted payment creates a
    // customer payment profile, create an ARB subscription with
    // ARBCreateSubscriptionRequest and persist the returned subscriptionId as
    // premiumProviderSubId / AISubscription.providerSubId. Renewal + cancellation
    // then flow through the net.authorize.customer.subscription.* webhooks already
    // mapped in verifyWebhook. Creating the subscription-from-profile handoff is a
    // documented TODO (it needs the hosted-profile callback wired first).
  },

  async cancelSubscription(providerSubId: string): Promise<CancelResult> {
    if (!configured() || !providerSubId) return { ok: false, error: "not configured" }
    try {
      const resp = await anetRequest({
        ARBCancelSubscriptionRequest: {
          merchantAuthentication: auth(),
          subscriptionId: providerSubId,
        },
      })
      return { ok: resp.messages?.resultCode === "Ok" }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "cancel failed" }
    }
  },

  async verifyWebhook(
    rawBody: string,
    headers: Headers | Record<string, string>
  ): Promise<NormalizedEvent | null> {
    const signatureKey = process.env.AUTHNET_SIGNATURE_KEY
    const header = readHeader(headers, "x-anet-signature")
    if (!signatureKey || !verifyAnetSignature(rawBody, header, signatureKey)) {
      throw new InvalidWebhookSignatureError()
    }

    const body = JSON.parse(rawBody) as {
      notificationId?: string
      eventType?: string
      payload?: {
        invoiceNumber?: string
        id?: string
        authAmount?: number
        responseCode?: number
      }
    }
    const eventType = body.eventType ?? ""
    const eventId = body.notificationId ?? body.payload?.id ?? ""

    // Successful card capture (initial or ARB-generated) → grant via invoice.
    if (eventType === "net.authorize.payment.authcapture.created") {
      const invoice = body.payload?.invoiceNumber
      if (!invoice) return null
      // Match the EXACT invoiceNumber we persisted at checkout (no prefix match).
      const order = await prisma.paymentOrder.findFirst({
        where: { provider: "authorizenet", invoiceNumber: invoice },
      })
      if (!order) return null
      // Defense-in-depth: never grant on an underpayment. authAmount is USD
      // dollars; expectedAmount is cents. Only reject when a settlement amount is
      // present and is strictly below what the order expected.
      const authAmount = body.payload?.authAmount
      if (typeof authAmount === "number") {
        const paidCents = Math.round(authAmount * 100)
        if (paidCents < Number(order.expectedAmount)) {
          console.error(
            "authorizenet authcapture underpaid",
            order.id,
            "paidCents",
            paidCents,
            "expected",
            order.expectedAmount
          )
          return null
        }
      }
      await prisma.paymentOrder.update({
        where: { id: order.id },
        data: { status: "paid", paidAt: new Date() },
      })
      return {
        provider: "authorizenet",
        eventId: eventId || order.id,
        type: eventType,
        action: "grant",
        plan: order.plan as PlanId,
        userId: order.userId,
        // Card is the recurring rail; renewals arrive as their own events.
        recurring: true,
        periodMonths: 1,
        raw: body,
      }
    }

    // ARB subscription cancelled → revoke whichever plan it backed.
    if (eventType === "net.authorize.customer.subscription.cancelled") {
      const subId = body.payload?.id
      if (!subId) return null
      const premiumUser = await prisma.user.findFirst({
        where: { premiumProvider: "authorizenet", premiumProviderSubId: subId },
        select: { id: true },
      })
      if (premiumUser) {
        return {
          provider: "authorizenet",
          eventId: eventId || `cancel:${subId}`,
          type: eventType,
          action: "revoke",
          plan: "premium",
          userId: premiumUser.id,
          recurring: true,
          providerSubId: subId,
          raw: body,
        }
      }
      const aiSub = await prisma.aISubscription.findFirst({
        where: { provider: "authorizenet", providerSubId: subId },
        select: { userId: true },
      })
      if (aiSub) {
        return {
          provider: "authorizenet",
          eventId: eventId || `cancel:${subId}`,
          type: eventType,
          action: "revoke",
          plan: "ai",
          userId: aiSub.userId,
          recurring: true,
          providerSubId: subId,
          raw: body,
        }
      }
      return null
    }

    // Valid signature but an event we don't act on.
    return null
  },
}
