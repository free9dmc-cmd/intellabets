import { describe, it, expect } from "vitest"
import { verifyNowpaymentsSignature } from "./nowpayments"
import { sortKeysDeep, hmacHex } from "./crypto-utils"

/**
 * NOWPayments signs the IPN body with HMAC-SHA512 over the JSON of the body with
 * keys RECURSIVELY SORTED alphabetically, keyed with the IPN secret. These tests
 * prove we reproduce that exactly and reject anything that doesn't match.
 */
const IPN_SECRET = "test-ipn-secret-0123456789"

/** Produce the signature NOWPayments would send for a given payload object. */
function signLikeNowpayments(payload: unknown, secret = IPN_SECRET): string {
  return hmacHex("sha512", secret, JSON.stringify(sortKeysDeep(payload)))
}

describe("verifyNowpaymentsSignature", () => {
  const payload = {
    payment_id: 5524759814,
    payment_status: "finished",
    order_id: "order_abc123",
    price_amount: 19.99,
    price_currency: "usd",
    actually_paid: 19.99,
    outcome: { amount: 19.99, currency: "usd" },
  }

  it("accepts a correctly-signed body regardless of key order in the raw bytes", () => {
    // The raw body arrives in NON-sorted key order; the verifier must sort first.
    const rawBody = JSON.stringify({
      outcome: { currency: "usd", amount: 19.99 },
      order_id: "order_abc123",
      price_currency: "usd",
      payment_status: "finished",
      actually_paid: 19.99,
      price_amount: 19.99,
      payment_id: 5524759814,
    })
    const sig = signLikeNowpayments(payload)
    expect(verifyNowpaymentsSignature(rawBody, sig, IPN_SECRET)).toBe(true)
  })

  it("rejects a tampered body (amount changed after signing)", () => {
    const sig = signLikeNowpayments(payload)
    const tampered = JSON.stringify({ ...payload, price_amount: 0.01 })
    expect(verifyNowpaymentsSignature(tampered, sig, IPN_SECRET)).toBe(false)
  })

  it("rejects a tampered status (waiting -> finished) with the original signature", () => {
    const original = { ...payload, payment_status: "waiting" }
    const sig = signLikeNowpayments(original)
    const forged = JSON.stringify({ ...original, payment_status: "finished" })
    expect(verifyNowpaymentsSignature(forged, sig, IPN_SECRET)).toBe(false)
  })

  it("rejects a signature made with the wrong secret", () => {
    const sig = signLikeNowpayments(payload, "attacker-secret")
    const rawBody = JSON.stringify(payload)
    expect(verifyNowpaymentsSignature(rawBody, sig, IPN_SECRET)).toBe(false)
  })

  it("rejects a missing signature", () => {
    const rawBody = JSON.stringify(payload)
    expect(verifyNowpaymentsSignature(rawBody, null, IPN_SECRET)).toBe(false)
    expect(verifyNowpaymentsSignature(rawBody, "", IPN_SECRET)).toBe(false)
  })

  it("rejects when the IPN secret is missing", () => {
    const sig = signLikeNowpayments(payload)
    expect(verifyNowpaymentsSignature(JSON.stringify(payload), sig, "")).toBe(false)
  })

  it("rejects an unparseable body", () => {
    const sig = signLikeNowpayments(payload)
    expect(verifyNowpaymentsSignature("not json {", sig, IPN_SECRET)).toBe(false)
  })
})
