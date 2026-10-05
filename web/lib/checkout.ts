import { NETWORK_ERROR_MESSAGE } from "@/lib/messages"
import { IAP_PRODUCTS, isNativePlatform, purchaseNative, tipsterProductId } from "@/lib/native-iap"

/** Plans sold through the subscription flow; keys of IAP_PRODUCTS. */
export type SubscriptionType = keyof typeof IAP_PRODUCTS

/** Everything that differs between "buy Premium", "buy AI Picks" and "subscribe to a tipster". */
export interface CheckoutPlan {
  /** In-app purchase product, used inside the iOS / Android app. */
  nativeProductId: string
  /** Sent alongside a native purchase so the webhook can credit the right tipster. */
  nativeTipsterId?: string
  /** JSON body for POST /api/checkout, used on the web. */
  checkoutBody: Record<string, string>
  /** Local-development activation, used only when /api/checkout answers `{ demo: true }`. */
  demo: { url: string; body: Record<string, string>; failureMessage: string }
}

/**
 * What happened. Callers decide what to do about it:
 *  - "redirecting":    the browser is leaving for the payment page; do nothing more
 *  - "purchased":      a native in-app purchase completed
 *  - "demo-activated": local-development activation succeeded
 *  - "cancelled":      the user backed out of the native purchase sheet
 *  - "failed":         something went wrong; `message` is safe to show
 */
export type CheckoutOutcome =
  | { status: "redirecting" }
  | { status: "purchased" }
  | { status: "demo-activated" }
  | { status: "cancelled" }
  | { status: "failed"; message: string }

/** The outside world, passed in so the flow can be tested without any of it. */
export interface CheckoutDeps {
  isNativePlatform: () => Promise<boolean>
  purchaseNative: (productId: string, tipsterId?: string) => ReturnType<typeof purchaseNative>
  fetch: (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "json">>
  redirect: (url: string) => void
}

const defaultDeps: CheckoutDeps = {
  isNativePlatform,
  purchaseNative,
  // Looked up at call time rather than captured at import, so a replaced
  // global fetch (in tests) is honored.
  fetch: (url, init) => fetch(url, init),
  redirect: (url) => {
    window.location.href = url
  },
}

/** Plan for buying Premium or standalone AI Picks. */
export function subscriptionPlan(
  type: SubscriptionType,
  demoFailureMessage = "Activation failed"
): CheckoutPlan {
  return {
    nativeProductId: IAP_PRODUCTS[type],
    checkoutBody: { type },
    demo: { url: "/api/premium", body: { type }, failureMessage: demoFailureMessage },
  }
}

/** Plan for subscribing to one tipster at their current price. */
export function tipsterPlan(tipsterId: string, price: number): CheckoutPlan {
  return {
    nativeProductId: tipsterProductId(price),
    nativeTipsterId: tipsterId,
    checkoutBody: { type: "tipster", tipsterId },
    demo: { url: "/api/subscriptions", body: { tipsterId }, failureMessage: "Failed" },
  }
}

interface JsonBody {
  url?: string
  demo?: boolean
  error?: string
}

/**
 * POST JSON. Resolves to null if the request never completed (offline, dropped
 * connection...), so callers can tell "no answer" apart from "answered no".
 */
async function postJson(deps: CheckoutDeps, url: string, body: Record<string, string>) {
  try {
    return await deps.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    return null
  }
}

const NETWORK_FAILURE: CheckoutOutcome = { status: "failed", message: NETWORK_ERROR_MESSAGE }

/** Parse a response body, treating an unreadable one as empty. */
async function readJson(res: Pick<Response, "json">): Promise<JsonBody> {
  return (await res.json().catch(() => ({}))) as JsonBody
}

/**
 * Start a purchase the right way for wherever the app is running:
 *  1. inside the iOS / Android app → the platform's in-app purchase
 *  2. on the web → ask the server for a payment-page URL and go there
 *  3. local development only → the server may reply `{ demo: true }`, and we
 *     then call the demo activation endpoint instead
 *
 * Returns an outcome rather than touching the UI; each caller reacts in its own way.
 */
export async function runCheckout(
  plan: CheckoutPlan,
  deps: CheckoutDeps = defaultDeps
): Promise<CheckoutOutcome> {
  if (await deps.isNativePlatform()) {
    const result = await deps.purchaseNative(plan.nativeProductId, plan.nativeTipsterId)
    if (result.cancelled) return { status: "cancelled" }
    if (result.error) return { status: "failed", message: result.error }
    return { status: "purchased" }
  }

  const checkoutRes = await postJson(deps, "/api/checkout", plan.checkoutBody)
  if (!checkoutRes) return NETWORK_FAILURE
  const checkout = await readJson(checkoutRes)
  if (checkout.url) {
    deps.redirect(checkout.url)
    return { status: "redirecting" }
  }

  // Only fall back to demo activation when the server explicitly says so. In
  // production that endpoint is a 404 by design, so surface the error instead.
  if (!checkout.demo) {
    return {
      status: "failed",
      message: checkout.error ?? "Could not start checkout. Please try again.",
    }
  }

  const demoRes = await postJson(deps, plan.demo.url, plan.demo.body)
  if (!demoRes) return NETWORK_FAILURE
  if (demoRes.ok) return { status: "demo-activated" }
  const demo = await readJson(demoRes)
  return { status: "failed", message: demo.error ?? plan.demo.failureMessage }
}
