import { describe, it, expect } from "vitest"
import {
  verifyNowpaymentsSignature,
  findNowpaymentsUnderpayment,
  isNowpaymentsConfigured,
} from "./nowpayments"
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

describe("isNowpaymentsConfigured", () => {
  const env = (vars: Record<string, string>) => vars as NodeJS.ProcessEnv

  it("is on only when both the API key and the IPN secret are set", () => {
    expect(
      isNowpaymentsConfigured(env({ NOWPAYMENTS_API_KEY: "k", NOWPAYMENTS_IPN_SECRET: "s" }))
    ).toBe(true)
  })

  it("stays off with the API key alone (invoices would be paid but never granted)", () => {
    expect(isNowpaymentsConfigured(env({ NOWPAYMENTS_API_KEY: "k" }))).toBe(false)
  })

  it("stays off with the IPN secret alone, or with neither", () => {
    expect(isNowpaymentsConfigured(env({ NOWPAYMENTS_IPN_SECRET: "s" }))).toBe(false)
    expect(isNowpaymentsConfigured(env({}))).toBe(false)
  })

  it("treats a blank or whitespace-only value as unset", () => {
    expect(
      isNowpaymentsConfigured(env({ NOWPAYMENTS_API_KEY: "k", NOWPAYMENTS_IPN_SECRET: "  " }))
    ).toBe(false)
  })
})

describe("findNowpaymentsUnderpayment", () => {
  const EXPECTED_CENTS = 1999

  it("passes a payment that arrived in full", () => {
    expect(
      findNowpaymentsUnderpayment(
        { price_amount: 19.99, pay_amount: 0.0003, actually_paid: 0.0003 },
        EXPECTED_CENTS
      )
    ).toBeNull()
  })

  it("passes an overpayment", () => {
    expect(
      findNowpaymentsUnderpayment(
        { price_amount: 19.99, pay_amount: 20, actually_paid: 25 },
        EXPECTED_CENTS
      )
    ).toBeNull()
  })

  it("rejects when less crypto arrived than was requested, even at the full invoice price", () => {
    // The case the old price-only check could not see.
    expect(
      findNowpaymentsUnderpayment(
        { price_amount: 19.99, pay_amount: 20, actually_paid: 10 },
        EXPECTED_CENTS
      )
    ).toMatch(/received 10 of 20/)
  })

  it("absorbs rounding inside the tolerance but not beyond it", () => {
    const fields = { price_amount: 19.99, pay_amount: 100 }
    expect(findNowpaymentsUnderpayment({ ...fields, actually_paid: 99.5 }, EXPECTED_CENTS)).toBeNull()
    expect(
      findNowpaymentsUnderpayment({ ...fields, actually_paid: 98.9 }, EXPECTED_CENTS)
    ).not.toBeNull()
  })

  it("rejects an invoice priced below what the order expected", () => {
    expect(
      findNowpaymentsUnderpayment(
        { price_amount: 9.99, pay_amount: 10, actually_paid: 10 },
        EXPECTED_CENTS
      )
    ).toMatch(/invoice priced/)
  })

  it("reads amounts sent as strings", () => {
    expect(
      findNowpaymentsUnderpayment(
        { price_amount: "19.99", pay_amount: "20", actually_paid: "10" },
        EXPECTED_CENTS
      )
    ).not.toBeNull()
    expect(
      findNowpaymentsUnderpayment(
        { price_amount: "19.99", pay_amount: "20", actually_paid: "20" },
        EXPECTED_CENTS
      )
    ).toBeNull()
  })

  it("rejects a payment where nothing arrived", () => {
    expect(
      findNowpaymentsUnderpayment({ pay_amount: 20, actually_paid: 0 }, EXPECTED_CENTS)
    ).not.toBeNull()
  })

  it("skips a comparison whose fields are absent or unparseable", () => {
    expect(findNowpaymentsUnderpayment({}, EXPECTED_CENTS)).toBeNull()
    expect(findNowpaymentsUnderpayment({ price_amount: 19.99 }, EXPECTED_CENTS)).toBeNull()
    expect(
      findNowpaymentsUnderpayment(
        { price_amount: 19.99, pay_amount: "n/a", actually_paid: null },
        EXPECTED_CENTS
      )
    ).toBeNull()
  })
})
