/**
 * The ONE place that turns a verified, normalised payment event into granted
 * (or revoked) entitlements. Nothing else in the app writes isPremium /
 * premiumUntil / AISubscription from a payment — routes call a provider, the
 * provider produces a NormalizedEvent, idempotency.ts gates it, and this
 * function applies it.
 *
 * Every write is defensive and safe to re-run: grants extend from the later of
 * "now" and the current expiry, so a replay (or an overlapping recurring +
 * per-period grant) can only ever move access forward, never double-count a
 * user into the far future in a way that compounds.
 */
import { prisma } from "../prisma"
import type { NormalizedEvent } from "./types"

/** Add whole months to a date without mutating the input. */
function addMonths(from: Date, months: number): Date {
  const d = new Date(from)
  d.setMonth(d.getMonth() + months)
  return d
}

/**
 * Extend an access window. Per-period rails (crypto/web3) must add their month
 * ON TOP of any time the user already has, so paying early never burns days.
 * Recurring rails renew after the old period, so the same rule is correct for
 * them too.
 */
function extend(current: Date | null | undefined, months: number, now: Date): Date {
  const base = current && current > now ? current : now
  return addMonths(base, months)
}

export async function applyBillingEvent(event: NormalizedEvent): Promise<void> {
  const now = new Date()
  const months = event.periodMonths ?? 1

  // Defensive: never fabricate entitlements for a user that no longer exists.
  const user = await prisma.user.findUnique({
    where: { id: event.userId },
    select: { id: true, premiumSince: true, premiumUntil: true },
  })
  if (!user) {
    console.error("applyBillingEvent: unknown user", event.userId, event.provider, event.eventId)
    return
  }

  if (event.plan === "premium") {
    if (event.action === "grant") {
      const premiumUntil = extend(user.premiumUntil, months, now)
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isPremium: true,
          premiumSince: user.premiumSince ?? now,
          premiumUntil,
          premiumProvider: event.provider,
          premiumProviderSubId: event.providerSubId ?? null,
        },
      })
    } else {
      // Revoke: drop the flag and the backing sub id so a later renewal of a
      // different sub can't resurrect it. premiumUntil is left as-is; the
      // entitlement helpers treat isPremium=false as "no access" regardless.
      await prisma.user.update({
        where: { id: user.id },
        data: { isPremium: false, premiumProviderSubId: null },
      })
    }
    return
  }

  if (event.plan === "ai") {
    if (event.action === "grant") {
      const existing = await prisma.aISubscription.findUnique({ where: { userId: user.id } })
      const expiresAt = extend(existing?.expiresAt, months, now)
      if (existing) {
        await prisma.aISubscription.update({
          where: { userId: user.id },
          data: {
            status: "active",
            expiresAt,
            provider: event.provider,
            providerSubId: event.providerSubId ?? null,
          },
        })
      } else {
        await prisma.aISubscription.create({
          data: {
            userId: user.id,
            status: "active",
            expiresAt,
            provider: event.provider,
            providerSubId: event.providerSubId ?? null,
          },
        })
      }
    } else {
      await prisma.aISubscription.updateMany({
        where: { userId: user.id },
        data: { status: "cancelled" },
      })
    }
  }
}
