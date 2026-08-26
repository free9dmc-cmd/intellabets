/**
 * Fail-closed gate for the mock/demo billing endpoints.
 *
 * Background: `POST /api/premium` and `POST /api/subscriptions` write paid
 * entitlements directly (isPremium, AISubscription, Subscription). They exist
 * so the app is usable locally without Stripe. Reachable in production they
 * are a complete revenue bypass — `middleware.ts` deliberately excludes
 * `/api`, so any authenticated user could call them with curl.
 *
 * This guard is deliberately NOT keyed off `isStripeConfigured()`. Tying a
 * payment bypass to the presence of an env var means one blank or rotated
 * STRIPE_SECRET_KEY silently re-enables free premium in production.
 *
 * Rules (both must hold, so the default is always "off"):
 *   1. Never enabled when NODE_ENV === "production".
 *   2. Otherwise requires an explicit opt-in: DEMO_BILLING="true".
 *
 * In production, entitlements may only be written by the signature-verified
 * webhooks (app/api/webhooks/stripe, app/api/webhooks/revenuecat) or by an
 * admin via app/api/admin/users/[id].
 */
export function isDemoBillingEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false
  return process.env.DEMO_BILLING === "true"
}
