import { NextResponse } from "next/server"
import { listConfiguredProviders, getDefaultProvider } from "@/lib/billing/registry"

// Reads server env via the providers' isConfigured(); keep on the node runtime.
export const runtime = "nodejs"

/**
 * Lists the payment rails that are actually configured, so the checkout picker
 * only ever offers rails that can complete. No secrets are returned — just ids
 * and labels and which one is the default (card).
 */
export async function GET() {
  const configured = listConfiguredProviders().map((p) => ({ id: p.id, label: p.label }))
  const def = getDefaultProvider()
  return NextResponse.json({
    providers: configured,
    defaultProviderId: def?.id ?? null,
  })
}
