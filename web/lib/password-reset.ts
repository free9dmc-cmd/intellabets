/**
 * Password reset tokens.
 *
 * A reset token is a bearer credential that bypasses the password, so it is
 * treated like one: 256 bits of randomness, stored only as a hash, valid for
 * an hour, and spendable once.
 */

import { createHash, randomBytes } from "crypto"

export const TOKEN_TTL_MINUTES = 60

/** A fresh token and the hash to store. The raw value is never persisted. */
export function newResetToken(): { token: string; tokenHash: string } {
  // 32 bytes -> 43 url-safe chars. Not guessable, and safe in a URL without
  // escaping, which matters because it travels in a query string.
  const token = randomBytes(32).toString("base64url")
  return { token, tokenHash: hashResetToken(token) }
}

/**
 * SHA-256, not bcrypt.
 *
 * Deliberate: this is a high-entropy random value, not a human-chosen
 * password, so there is no dictionary to slow down and nothing for a work
 * factor to buy. A fast hash also keeps the lookup a single indexed query
 * rather than a scan-and-compare over every outstanding token.
 */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function resetTokenExpiry(now = new Date()): Date {
  return new Date(now.getTime() + TOKEN_TTL_MINUTES * 60_000)
}
