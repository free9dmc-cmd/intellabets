import { describe, expect, it, vi } from "vitest"
import { NETWORK_ERROR_MESSAGE } from "./messages"
import {
  runCheckout,
  subscriptionPlan,
  tipsterPlan,
  type CheckoutDeps,
  type CheckoutPlan,
} from "./checkout"

/** A fake response; `body: null` simulates a reply that isn't valid JSON. */
function reply(ok: boolean, body: unknown) {
  return {
    ok,
    json: async () => {
      if (body === null) throw new Error("not json")
      return body
    },
  }
}

/** Fake dependencies that fail loudly if the flow touches something it shouldn't. */
function makeDeps(overrides: Partial<CheckoutDeps> = {}) {
  const deps = {
    isNativePlatform: vi.fn(async () => false),
    purchaseNative: vi.fn(async () => {
      throw new Error("native purchase should not be called")
    }),
    fetch: vi.fn(async () => {
      throw new Error("unexpected fetch")
    }),
    redirect: vi.fn(),
    ...overrides,
  }
  return deps as typeof deps & CheckoutDeps
}

const plan: CheckoutPlan = {
  nativeProductId: "com.example.product",
  checkoutBody: { type: "premium" },
  demo: { url: "/api/demo", body: { type: "premium" }, failureMessage: "Demo failed" },
}

describe("runCheckout — inside the native app", () => {
  const native = (result: object) =>
    makeDeps({
      isNativePlatform: vi.fn(async () => true),
      purchaseNative: vi.fn(async () => result as never),
    })

  it("reports a completed purchase, without touching the network", async () => {
    const deps = native({ success: true })
    expect(await runCheckout(plan, deps)).toEqual({ status: "purchased" })
    expect(deps.purchaseNative).toHaveBeenCalledWith("com.example.product", undefined)
    expect(deps.fetch).not.toHaveBeenCalled()
  })

  it("passes the tipster id through so the webhook can credit them", async () => {
    const deps = native({ success: true })
    await runCheckout({ ...plan, nativeTipsterId: "tip_1" }, deps)
    expect(deps.purchaseNative).toHaveBeenCalledWith("com.example.product", "tip_1")
  })

  it("reports a cancellation as cancelled, not as an error", async () => {
    expect(await runCheckout(plan, native({ success: false, cancelled: true }))).toEqual({
      status: "cancelled",
    })
  })

  it("surfaces the store's error message", async () => {
    expect(await runCheckout(plan, native({ success: false, error: "Not available" }))).toEqual({
      status: "failed",
      message: "Not available",
    })
  })
})

describe("runCheckout — on the web", () => {
  it("asks the server for a payment page and redirects to it", async () => {
    const deps = makeDeps({ fetch: vi.fn(async () => reply(true, { url: "https://pay.example/s/1" })) })

    expect(await runCheckout(plan, deps)).toEqual({ status: "redirecting" })

    expect(deps.fetch).toHaveBeenCalledTimes(1)
    expect(deps.fetch).toHaveBeenCalledWith("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "premium" }),
    })
    expect(deps.redirect).toHaveBeenCalledWith("https://pay.example/s/1")
    expect(deps.purchaseNative).not.toHaveBeenCalled()
  })

  it("shows the server's error when checkout can't start", async () => {
    const deps = makeDeps({ fetch: vi.fn(async () => reply(false, { error: "No processor" })) })
    expect(await runCheckout(plan, deps)).toEqual({ status: "failed", message: "No processor" })
    expect(deps.redirect).not.toHaveBeenCalled()
  })

  it.each([
    { name: "has no error field", body: {} },
    { name: "is not valid JSON", body: null },
  ])("uses a generic message when the reply $name", async ({ body }) => {
    const deps = makeDeps({ fetch: vi.fn(async () => reply(false, body)) })
    expect(await runCheckout(plan, deps)).toEqual({
      status: "failed",
      message: "Could not start checkout. Please try again.",
    })
  })

  it("reports a network failure instead of throwing, so the UI never gets stuck", async () => {
    const deps = makeDeps({
      fetch: vi.fn(async () => {
        throw new TypeError("Failed to fetch")
      }),
    })
    expect(await runCheckout(plan, deps)).toEqual({
      status: "failed",
      message: NETWORK_ERROR_MESSAGE,
    })
    expect(deps.redirect).not.toHaveBeenCalled()
  })

  it("never falls back to demo activation unless the server says demo: true", async () => {
    const deps = makeDeps({ fetch: vi.fn(async () => reply(true, { error: "nope" })) })
    await runCheckout(plan, deps)
    expect(deps.fetch).toHaveBeenCalledTimes(1) // only /api/checkout, never the demo URL
  })
})

describe("runCheckout — local-development demo fallback", () => {
  /** First call answers /api/checkout with demo: true; second is the demo endpoint. */
  function demoDeps(demoReply: ReturnType<typeof reply>) {
    return makeDeps({
      fetch: vi
        .fn()
        .mockResolvedValueOnce(reply(true, { demo: true }))
        .mockResolvedValueOnce(demoReply),
    })
  }

  it("calls the plan's demo endpoint and reports success", async () => {
    const deps = demoDeps(reply(true, {}))
    expect(await runCheckout(plan, deps)).toEqual({ status: "demo-activated" })
    expect(deps.fetch).toHaveBeenNthCalledWith(2, "/api/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "premium" }),
    })
  })

  it("shows the demo endpoint's error", async () => {
    expect(await runCheckout(plan, demoDeps(reply(false, { error: "Already active" })))).toEqual({
      status: "failed",
      message: "Already active",
    })
  })

  it("reports a network failure on the demo call too", async () => {
    const deps = makeDeps({
      fetch: vi
        .fn()
        .mockResolvedValueOnce(reply(true, { demo: true }))
        .mockRejectedValueOnce(new TypeError("Failed to fetch")),
    })
    expect(await runCheckout(plan, deps)).toEqual({ status: "failed", message: NETWORK_ERROR_MESSAGE })
  })

  it("falls back to the plan's own failure message when the reply is unreadable", async () => {
    expect(await runCheckout(plan, demoDeps(reply(false, null)))).toEqual({
      status: "failed",
      message: "Demo failed",
    })
  })
})

describe("plan builders", () => {
  it("subscriptionPlan targets the matching store product and demo endpoint", () => {
    expect(subscriptionPlan("premium")).toEqual({
      nativeProductId: "com.intellabets.premium",
      checkoutBody: { type: "premium" },
      demo: { url: "/api/premium", body: { type: "premium" }, failureMessage: "Activation failed" },
    })
    expect(subscriptionPlan("ai", "Failed to activate").demo.failureMessage).toBe("Failed to activate")
    expect(subscriptionPlan("ai").nativeProductId).toBe("com.intellabets.ai")
  })

  it("tipsterPlan snaps the price to the nearest store tier and names the tipster", () => {
    expect(tipsterPlan("tip_1", 9.99)).toEqual({
      nativeProductId: "com.intellabets.tipster_999",
      nativeTipsterId: "tip_1",
      checkoutBody: { type: "tipster", tipsterId: "tip_1" },
      demo: { url: "/api/subscriptions", body: { tipsterId: "tip_1" }, failureMessage: "Failed" },
    })
    // $12.00 is 201¢ from the $9.99 tier and 299¢ from the $14.99 tier.
    expect(tipsterPlan("tip_1", 12).nativeProductId).toBe("com.intellabets.tipster_999")
    expect(tipsterPlan("tip_1", 49.99).nativeProductId).toBe("com.intellabets.tipster_4999")
  })
})
