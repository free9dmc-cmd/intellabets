/**
 * Provider lookup. The routes and UI ask the registry for a provider by id, for
 * the default, or for the list of currently-configured rails — they never import
 * a concrete provider. `isConfigured()` is re-evaluated on every call (it reads
 * env lazily), so a rail turns on/off with its keys and no redeploy.
 */
import type { PaymentProvider } from "./provider"
import type { ProviderId } from "./types"
import { ALL_PROVIDERS } from "./providers"

/** The default rail: CARD (Authorize.Net). */
const DEFAULT_PROVIDER_ID: ProviderId = "authorizenet"

/** Get a specific provider by id, regardless of whether it is configured. */
export function getProvider(id: string): PaymentProvider | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id)
}

/**
 * The default provider to use when the client doesn't specify one — but only if
 * it is actually configured. Falls back to the first configured provider, or
 * undefined when none are. An explicit BILLING_PROVIDER env overrides the
 * default id (still subject to being configured).
 */
export function getDefaultProvider(): PaymentProvider | undefined {
  const preferredId = (process.env.BILLING_PROVIDER as ProviderId) || DEFAULT_PROVIDER_ID
  const preferred = getProvider(preferredId)
  if (preferred?.isConfigured()) return preferred
  return listConfiguredProviders()[0]
}

/** Every provider whose env is present and well-formed, in registration order. */
export function listConfiguredProviders(): PaymentProvider[] {
  return ALL_PROVIDERS.filter((p) => p.isConfigured())
}

/**
 * Resolve the provider the caller asked for, falling back to the default when
 * the requested one is missing or not configured. Returns undefined only when
 * nothing is configured at all (caller should then degrade to a clean 503).
 */
export function resolveProvider(requestedId?: string | null): PaymentProvider | undefined {
  if (requestedId) {
    const requested = getProvider(requestedId)
    if (requested?.isConfigured()) return requested
  }
  return getDefaultProvider()
}
