import { describe, it, expect } from "vitest"
import crypto from "crypto"
import { verifyAnetSignature } from "./authorizenet"

/**
 * Authorize.Net sends `X-ANET-Signature: sha512=<HEX>`, an HMAC-SHA512 over the
 * RAW request body keyed with the account's Signature Key — and crucially the
 * Signature Key is a HEX string that must be decoded to bytes before use. These
 * tests prove we reproduce that and reject forgeries.
 */
// A realistic 128-char (even-length) hex Signature Key, as Authorize.Net issues.
const SIGNATURE_KEY = "AB".repeat(64)

const RAW_BODY = JSON.stringify({
  notificationId: "d4f7e1c0-1234-5678-9abc-def012345678",
  eventType: "net.authorize.payment.authcapture.created",
  eventDate: "2026-10-02T12:00:00.000Z",
  webhookId: "a1b2c3d4",
  payload: {
    responseCode: 1,
    authCode: "ABC123",
    avsResponse: "Y",
    authAmount: 19.99,
    invoiceNumber: "order_abc123",
    entityName: "transaction",
    id: "40012345678",
  },
})

/** Produce the signature Authorize.Net would send for a given raw body. */
function signLikeAnet(rawBody: string, keyHex = SIGNATURE_KEY): string {
  const keyBytes = Buffer.from(keyHex, "hex")
  const hex = crypto.createHmac("sha512", keyBytes).update(rawBody, "utf8").digest("hex").toUpperCase()
  return `sha512=${hex}`
}

describe("verifyAnetSignature", () => {
  it("accepts a correctly-signed raw body (sha512= prefix, uppercase hex)", () => {
    const sig = signLikeAnet(RAW_BODY)
    expect(verifyAnetSignature(RAW_BODY, sig, SIGNATURE_KEY)).toBe(true)
  })

  it("accepts the header case-insensitively and with lowercase hex", () => {
    const sig = signLikeAnet(RAW_BODY).toLowerCase() // "sha512=....." lowercased
    expect(verifyAnetSignature(RAW_BODY, sig, SIGNATURE_KEY)).toBe(true)
  })

  it("rejects a tampered body (amount changed after signing)", () => {
    const sig = signLikeAnet(RAW_BODY)
    const tampered = RAW_BODY.replace("19.99", "0.01")
    expect(verifyAnetSignature(tampered, sig, SIGNATURE_KEY)).toBe(false)
  })

  it("rejects a signature made with the wrong key", () => {
    const wrongKey = "00".repeat(64)
    const sig = signLikeAnet(RAW_BODY, wrongKey)
    expect(verifyAnetSignature(RAW_BODY, sig, SIGNATURE_KEY)).toBe(false)
  })

  it("rejects when the key is NOT hex-decoded (proves we decode the key to bytes)", () => {
    // Sign using the signature key as a raw utf-8 string instead of hex bytes.
    const hex = crypto
      .createHmac("sha512", SIGNATURE_KEY) // wrong: string key, not hex-decoded
      .update(RAW_BODY, "utf8")
      .digest("hex")
      .toUpperCase()
    expect(verifyAnetSignature(RAW_BODY, `sha512=${hex}`, SIGNATURE_KEY)).toBe(false)
  })

  it("rejects a missing or empty signature header", () => {
    expect(verifyAnetSignature(RAW_BODY, null, SIGNATURE_KEY)).toBe(false)
    expect(verifyAnetSignature(RAW_BODY, "", SIGNATURE_KEY)).toBe(false)
    expect(verifyAnetSignature(RAW_BODY, "sha512=", SIGNATURE_KEY)).toBe(false)
  })

  it("rejects when the signature key is missing", () => {
    const sig = signLikeAnet(RAW_BODY)
    expect(verifyAnetSignature(RAW_BODY, sig, "")).toBe(false)
  })
})
