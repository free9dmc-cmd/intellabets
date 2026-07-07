// @ts-nocheck
// Product identifiers — must match App Store Connect & Google Play Console exactly
export const IAP_PRODUCTS = {
  premium: "com.intellabets.premium",
  ai: "com.intellabets.ai",
} as const

// Pre-defined tipster price tiers (in cents) — create all 10 in both stores
const TIPSTER_TIERS = [499, 999, 1499, 1999, 2499, 2999, 3499, 3999, 4499, 4999]

export function tipsterProductId(priceUsd: number): string {
  const cents = Math.round(priceUsd * 100)
  const nearest = TIPSTER_TIERS.reduce((a, b) =>
    Math.abs(b - cents) < Math.abs(a - cents) ? b : a
  )
  return `com.intellabets.tipster_${nearest}`
}

export function priceFromTipsterProductId(productId: string): number {
  const match = productId.match(/tipster_(\d+)$/)
  return match ? parseInt(match[1]) / 100 : 9.99
}

export async function isNativePlatform(): Promise<boolean> {
  if (typeof window === "undefined") return false
  try {
    // webpackIgnore: true tells the bundler not to resolve this at build time
    const { Capacitor } = await import(/* webpackIgnore: true */ "@capacitor/core")
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export async function initRevenueCat(userId: string): Promise<void> {
  try {
    const { Capacitor } = await import(/* webpackIgnore: true */ "@capacitor/core")
    if (!Capacitor.isNativePlatform()) return
    const { Purchases } = await import(/* webpackIgnore: true */ "@revenuecat/purchases-capacitor")
    const apiKey =
      Capacitor.getPlatform() === "ios"
        ? (process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY ?? "")
        : (process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_KEY ?? "")
    if (!apiKey) return
    await Purchases.configure({ apiKey })
    await Purchases.logIn({ appUserID: userId })
  } catch {
    // Not native or SDK not installed
  }
}

export async function purchaseNative(
  productId: string,
  tipsterId?: string
): Promise<{ success: boolean; cancelled?: boolean; error?: string }> {
  try {
    const { Purchases } = await import(/* webpackIgnore: true */ "@revenuecat/purchases-capacitor")
    if (tipsterId) {
      await Purchases.setAttributes({ tipster_id: tipsterId })
    }
    const { products } = await Purchases.getProducts({
      productIdentifiers: [productId],
      type: "SUBSCRIPTION",
    })
    if (!products.length) return { success: false, error: "Product not available in this region" }
    await Purchases.purchaseStoreProduct({ product: products[0] })
    return { success: true }
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string }
    if (err?.code === "PURCHASE_CANCELLED") return { success: false, cancelled: true }
    return { success: false, error: err?.message ?? "Purchase failed" }
  }
}
