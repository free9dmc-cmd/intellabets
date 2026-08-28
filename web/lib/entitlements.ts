/**
 * Single source of truth for what a user is entitled to.
 *
 * Premium Tipster membership BUNDLES AI Picks. AI access is therefore a
 * DERIVED entitlement — we never mirror it into a second AISubscription row
 * when someone buys Premium. Deriving it means:
 *   - nothing to keep in sync, so the two can never disagree
 *   - when Premium lapses, bundled AI access lapses with it automatically
 *   - a separately-purchased AI subscription still stands on its own
 *
 * Every gate (API routes, pages, status endpoints) must go through these
 * helpers rather than re-deriving the rules inline.
 */

/** Minimal shape needed to judge premium status. */
export interface PremiumFields {
  isPremium: boolean
  premiumUntil?: Date | null
}

/** Minimal shape of a standalone AI subscription row. */
export interface AISubFields {
  status: string
  expiresAt: Date
}

/** Premium is active if flagged AND not past its expiry (null = no expiry). */
export function isPremiumActive(
  user: PremiumFields | null | undefined,
  now: Date = new Date()
): boolean {
  if (!user?.isPremium) return false
  return !user.premiumUntil || user.premiumUntil > now
}

/** A standalone (separately purchased) AI subscription that is still valid. */
export function hasStandaloneAISub(
  aiSub: AISubFields | null | undefined,
  now: Date = new Date()
): boolean {
  if (!aiSub) return false
  return aiSub.status === "active" && aiSub.expiresAt > now
}

/**
 * Can this user generate AI picks?
 * True if they bought AI Picks directly OR hold an active Premium membership
 * (Premium includes AI Picks).
 */
export function hasAIAccess(
  user: (PremiumFields & { aiSubscription?: AISubFields | null }) | null | undefined,
  now: Date = new Date()
): boolean {
  if (!user) return false
  return hasStandaloneAISub(user.aiSubscription, now) || isPremiumActive(user, now)
}

/** Why the user has AI access — drives copy and prevents double-selling. */
export type AIAccessSource = "premium" | "standalone" | "none"

export function aiAccessSource(
  user: (PremiumFields & { aiSubscription?: AISubFields | null }) | null | undefined,
  now: Date = new Date()
): AIAccessSource {
  if (!user) return "none"
  // Premium wins for display purposes: it is the bundle they are already paying
  // for, so we must not offer to sell them AI Picks again.
  if (isPremiumActive(user, now)) return "premium"
  if (hasStandaloneAISub(user.aiSubscription, now)) return "standalone"
  return "none"
}
