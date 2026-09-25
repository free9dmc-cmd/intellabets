import { NextResponse } from "next/server"

/**
 * Clean 503 for when the payment processor is reachable but rejecting us — a
 * revoked or rotated-but-still-well-formed API key throws a Stripe auth error
 * deep inside a live call, which would otherwise surface to the client as an
 * opaque 500. A 503 tells the client (and our monitoring) this is a transient
 * provider-side outage, not a bug in the request.
 */
export function billingUnavailableResponse() {
  return NextResponse.json(
    { error: "Billing is temporarily unavailable. Please try again later.", code: "BILLING_UNAVAILABLE" },
    { status: 503 }
  )
}

/**
 * True when an error thrown by the payment processor is an authentication
 * failure (revoked/invalid key). Kept here so every route that makes a live
 * processor call detects it the same way.
 */
export function isBillingAuthError(err: unknown): boolean {
  const e = err as { statusCode?: number; type?: string; name?: string } | null | undefined
  return (
    e?.statusCode === 401 ||
    e?.type === "StripeAuthenticationError" ||
    e?.name === "StripeAuthenticationError"
  )
}
