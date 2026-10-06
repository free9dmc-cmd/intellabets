"use client"

/**
 * Client-only provider for the self-custody USDC rail: initialises Reown AppKit
 * once at module scope and wraps children in WagmiProvider + QueryClientProvider.
 *
 * It is designed to be mounted via a dynamic import with ssr:false (see
 * WalletCheckout), so none of this AppKit/wagmi code runs during SSR or the
 * build — which is what keeps the web build green regardless of wallet config.
 * When the WalletConnect project id is absent the provider is a passthrough, so
 * the rest of the UI renders normally with the wallet option simply hidden.
 */
import { useState, type ReactNode } from "react"
import { createAppKit } from "@reown/appkit/react"
import { WagmiProvider, cookieToInitialState } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  getWagmiAdapter,
  appKitNetworks,
  walletConnectProjectId,
  isWalletConfigured,
} from "@/lib/wagmi"

// Initialise AppKit exactly once, and only when actually configured. This runs
// on the client only (the module is loaded behind ssr:false).
if (isWalletConfigured()) {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof window !== "undefined" ? window.location.origin : "https://intellabets.com")
  createAppKit({
    adapters: [getWagmiAdapter()],
    networks: appKitNetworks,
    projectId: walletConnectProjectId,
    metadata: {
      name: "IntellaBets",
      description: "IntellaBets premium memberships, paid with USDC on Base.",
      url: appUrl,
      icons: [`${appUrl}/icon.png`],
    },
    features: { analytics: false, email: false, socials: [] },
  })
}

function Web3ProviderInner({
  children,
  cookies,
}: {
  children: ReactNode
  cookies: string | null
}) {
  const adapter = getWagmiAdapter()
  const [queryClient] = useState(() => new QueryClient())
  const initialState = cookieToInitialState(adapter.wagmiConfig, cookies)
  return (
    <WagmiProvider config={adapter.wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}

export default function Web3Provider({
  children,
  cookies = null,
}: {
  children: ReactNode
  /**
   * Optional SSR cookie header for wagmi hydration. When this provider is
   * mounted client-only (ssr:false) it stays null, which cookieToInitialState
   * handles fine; the param exists so the provider can be lifted into a layout
   * with cookieToInitialState wired through headers() later without changes.
   */
  cookies?: string | null
}) {
  // No hooks here, so this early return never violates the rules of hooks.
  if (!isWalletConfigured()) return <>{children}</>
  return <Web3ProviderInner cookies={cookies}>{children}</Web3ProviderInner>
}
