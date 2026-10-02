/**
 * Client-side wagmi / Reown AppKit configuration for the self-custody USDC rail.
 *
 * IMPORTANT: this module is imported ONLY by client components (it is pulled in
 * through a dynamically-imported, ssr:false provider), and it never throws when
 * its env is missing — a missing WalletConnect project id simply makes
 * isWalletConfigured() false and the wallet option is hidden. That keeps the
 * self-custody rail dormant-by-default and the web build green.
 */
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi"
import { base, baseSepolia } from "@reown/appkit/networks"
import type { AppKitNetwork } from "@reown/appkit/networks"
import { http } from "wagmi"

/** WalletConnect / Reown Cloud project id (public). "" when unset. */
export const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ""

/** Toggle Base Sepolia (testnet) instead of Base mainnet. */
export const web3Sandbox = process.env.NEXT_PUBLIC_WEB3_SANDBOX === "true"

/** The single chain the wallet rail targets (Base, or Base Sepolia in sandbox). */
export const appKitNetworks = (web3Sandbox ? [baseSepolia] : [base]) as [
  AppKitNetwork,
  ...AppKitNetwork[],
]

/** True only when the public WalletConnect project id is present. */
export function isWalletConfigured(): boolean {
  return walletConnectProjectId.length > 0
}

// The adapter is built once, lazily, so the heavy wagmi/AppKit config is only
// constructed on the client when the wallet UI actually mounts.
let _adapter: WagmiAdapter | null = null

export function getWagmiAdapter(): WagmiAdapter {
  if (_adapter) return _adapter
  const rpcUrl = process.env.NEXT_PUBLIC_WEB3_RPC_URL
  _adapter = new WagmiAdapter({
    projectId: walletConnectProjectId || "intellabets-placeholder",
    networks: appKitNetworks,
    ssr: true, // required for Next.js
    transports: rpcUrl
      ? Object.fromEntries(appKitNetworks.map((n) => [n.id, http(rpcUrl)]))
      : undefined,
  })
  return _adapter
}
