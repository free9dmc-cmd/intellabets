import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getProvider } from "@/lib/billing/registry"
import { withIdempotency } from "@/lib/billing/idempotency"
import { applyBillingEvent } from "@/lib/billing/events"

// Node runtime: viem + Prisma.
export const runtime = "nodejs"

/**
 * Authenticated confirmation of a self-custody USDC payment.
 *
 * The client submits the tx hash and the order id it was given at checkout. We
 * NEVER trust that the payment happened because the client says so — the
 * provider reads the chain and verifies the Transfer against the server-created
 * order (amount / recipient / token / optional from-address / confirmations).
 * Only a provably-settled transfer yields a NormalizedEvent and a grant.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { txHash, orderId } = await req.json().catch(() => ({}))
  if (typeof txHash !== "string" || typeof orderId !== "string") {
    return NextResponse.json({ error: "txHash and orderId are required" }, { status: 400 })
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "Invalid txHash" }, { status: 400 })
  }

  const provider = getProvider("web3")
  if (!provider?.verifyOnChainPayment) {
    return NextResponse.json({ error: "Web3 payments unavailable" }, { status: 503 })
  }

  // The order must belong to the authenticated user — a user may only confirm
  // payment for their own order, never settle someone else's.
  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } })
  if (!order || order.userId !== session.user.id) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 })
  }

  let event
  try {
    event = await provider.verifyOnChainPayment(txHash, orderId)
  } catch (err) {
    console.error("web3 confirm error:", err)
    return NextResponse.json({ error: "Verification failed" }, { status: 500 })
  }

  if (!event) {
    // Either the tx isn't settled/confirmed yet, or it doesn't match the order.
    return NextResponse.json(
      { confirmed: false, error: "Payment not verified. If you just paid, wait for confirmations and retry." },
      { status: 400 }
    )
  }

  const { deduped } = await withIdempotency(event.provider, event.eventId, event.type, () =>
    applyBillingEvent(event)
  )
  return NextResponse.json({ confirmed: true, deduped, plan: event.plan })
}
