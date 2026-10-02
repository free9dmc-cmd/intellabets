import { NextResponse } from "next/server"
import { getProvider } from "@/lib/billing/registry"
import { InvalidWebhookSignatureError } from "@/lib/billing/provider"
import { withIdempotency } from "@/lib/billing/idempotency"
import { applyBillingEvent } from "@/lib/billing/events"

// Node runtime: HMAC verification uses node:crypto and Prisma writes entitlements.
export const runtime = "nodejs"

export async function POST(req: Request) {
  // RAW body, read before any parse, so the HMAC verifies over exact bytes.
  const raw = await req.text()
  const provider = getProvider("authorizenet")
  if (!provider) return NextResponse.json({ error: "Unknown provider" }, { status: 400 })

  let event
  try {
    event = await provider.verifyWebhook(raw, req.headers)
  } catch (err) {
    if (err instanceof InvalidWebhookSignatureError) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
    }
    console.error("Authorize.Net webhook error:", err)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }

  // Valid signature, nothing to apply (an event type we don't act on).
  if (!event) return NextResponse.json({ received: true })

  const { deduped } = await withIdempotency(event.provider, event.eventId, event.type, () =>
    applyBillingEvent(event)
  )
  return NextResponse.json({ received: true, deduped })
}
