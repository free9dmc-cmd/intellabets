/**
 * Exactly-once application of money-path events.
 *
 * Processors retry webhooks until they see a 2xx, and a client can submit the
 * same settled tx hash twice. Because granting access is not naturally
 * idempotent (a per-period crypto payment adds +1 month every time it runs), we
 * CLAIM the event first with a unique insert into ProcessedEvent. If the insert
 * wins, we run `fn`. If it loses the unique race (Prisma P2002), the event was
 * already handled and we skip `fn` entirely.
 *
 * The claim and `fn` are intentionally NOT wrapped in one transaction: we would
 * rather occasionally retry a half-applied event (the writes in events.ts are
 * themselves defensive/idempotent) than lose one. The claim is what guarantees
 * we never double-grant on the happy path.
 */
import { Prisma } from "@prisma/client"
import { prisma } from "../prisma"
import type { ProviderId } from "./types"

export interface IdempotencyResult {
  deduped: boolean
}

export async function withIdempotency(
  provider: ProviderId,
  eventId: string,
  type: string | null,
  fn: () => Promise<void>
): Promise<IdempotencyResult> {
  try {
    await prisma.processedEvent.create({
      data: { provider, eventId, type: type ?? undefined },
    })
  } catch (err) {
    // P2002 = unique constraint violation on (provider, eventId): already done.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { deduped: true }
    }
    throw err
  }

  try {
    await fn()
  } catch (err) {
    // The claim stands even if application failed, to avoid a poison event
    // being retried forever. Release it so the processor's retry can re-apply.
    await prisma.processedEvent
      .deleteMany({ where: { provider, eventId } })
      .catch(() => {})
    throw err
  }

  return { deduped: false }
}
