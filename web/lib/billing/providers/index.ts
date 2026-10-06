/**
 * The provider table. Registering a rail here is the only wiring the registry
 * needs; order matters only as the deterministic order listConfiguredProviders
 * returns. CARD (Authorize.Net) is first so it is the default.
 */
import type { PaymentProvider } from "../provider"
import { authorizenetProvider } from "./authorizenet"
import { nowpaymentsProvider } from "./nowpayments"
import { web3Provider } from "./web3"

export const ALL_PROVIDERS: readonly PaymentProvider[] = [
  authorizenetProvider, // CARD — default
  nowpaymentsProvider, // custodial crypto
  web3Provider, // self-custody USDC on Base
]
