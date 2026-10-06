/**
 * Small, dependency-free crypto helpers shared by the webhook-verifying
 * providers. Kept pure and separately importable so the signature logic can be
 * unit-tested without any network or env.
 */
import crypto from "crypto"

/**
 * Constant-time string compare that never throws and never short-circuits on
 * length. `crypto.timingSafeEqual` requires equal-length buffers, so we hash
 * both sides to a fixed width first — this also avoids leaking the expected
 * signature's length through timing.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a, "utf8").digest()
  const hb = crypto.createHash("sha256").update(b, "utf8").digest()
  return crypto.timingSafeEqual(ha, hb)
}

/**
 * Recursively sort an object's keys alphabetically (arrays keep their order,
 * their object elements are sorted). NOWPayments signs the JSON of the IPN body
 * with keys sorted this way, so we must reproduce it exactly before hashing.
 */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep)
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeysDeep(obj[key])
    }
    return out
  }
  return value
}

/** HMAC of `message` with `secret`, hex-encoded. */
export function hmacHex(algorithm: "sha512", secret: string, message: string): string {
  return crypto.createHmac(algorithm, secret).update(message, "utf8").digest("hex")
}
