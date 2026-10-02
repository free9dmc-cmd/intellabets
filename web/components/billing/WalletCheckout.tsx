"use client"

/**
 * Self-custody USDC checkout UI (Base). Rendered client-only via a dynamic
 * import with ssr:false from the premium page, so none of this runs during the
 * build.
 *
 * Flow:
 *   1. Connect a wallet (Reown AppKit modal).
 *   2. Ask the server to create an order bound to the connected address; it
 *      returns the exact token / recipient / base-unit amount to send.
 *   3. Do the ERC-20 `transfer` from the user's own wallet (no contract of ours).
 *   4. POST the tx hash + order id to the confirm route, which VERIFIES the
 *      transfer on-chain before granting. We never grant from the client.
 */
import { useState } from "react"
import { erc20Abi, formatUnits } from "viem"
import {
  useAccount,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi"
import { useAppKit } from "@reown/appkit/react"
import Web3Provider from "./Web3Provider"
import { isWalletConfigured } from "@/lib/wagmi"
import type { PlanId } from "@/lib/billing/types"

type WalletOrder = {
  chainId: number
  tokenAddress: string
  amount: string
  recipient: string
  orderId: string
  decimals: number
}

function WalletCheckoutInner({ plan, onGranted }: { plan: PlanId; onGranted: () => void }) {
  const { address, isConnected, chainId } = useAccount()
  const { open } = useAppKit()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const [status, setStatus] = useState<string>("")
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  // Surfaces the on-chain confirmation purely for UX; the server does its own.
  useWaitForTransactionReceipt({ hash: txHash })

  async function confirmWithServer(hash: string, orderId: string): Promise<boolean> {
    // The server requires N confirmations, so retry a few times with backoff.
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch("/api/webhooks/web3/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: hash, orderId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.confirmed) return true
      setStatus(`Waiting for confirmations… (${attempt + 1}/6)`)
      await new Promise((r) => setTimeout(r, 5000))
    }
    return false
  }

  async function pay() {
    try {
      setBusy(true)
      setStatus("")

      if (!isConnected) {
        await open()
        setStatus("Connect your wallet, then press Pay again.")
        setBusy(false)
        return
      }

      // 1. Create the order, bound to the connected wallet.
      setStatus("Creating order…")
      const checkoutRes = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: plan, providerId: "web3", walletAddress: address }),
      })
      const order = (await checkoutRes.json().catch(() => ({}))) as Partial<WalletOrder> & {
        kind?: string
        error?: string
      }
      if (order.kind !== "wallet" || !order.orderId) {
        setStatus(order.error ?? "Could not start a wallet payment.")
        setBusy(false)
        return
      }

      // 2. Make sure we're on the right chain.
      if (chainId !== order.chainId) {
        setStatus("Switching network…")
        await switchChainAsync({ chainId: order.chainId! })
      }

      // 3. ERC-20 transfer of USDC to our receiving address. We transfer EXACTLY
      // the per-order amount the server returned — the server verifies an exact
      // match, so the amount must not be rounded or altered client-side.
      const humanAmount = formatUnits(BigInt(order.amount!), order.decimals ?? 6)
      setStatus(`Confirm the transfer of exactly ${humanAmount} USDC in your wallet…`)
      const hash = await writeContractAsync({
        address: order.tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: "transfer",
        args: [order.recipient as `0x${string}`, BigInt(order.amount!)],
        chainId: order.chainId,
      })
      setTxHash(hash)

      // 4. Server-side verification + grant.
      setStatus("Verifying payment on-chain…")
      const ok = await confirmWithServer(hash, order.orderId)
      if (ok) {
        setStatus("Payment confirmed. Access granted.")
        onGranted()
      } else {
        setStatus(
          "Your transfer was sent but isn't confirmed yet. It will be credited once it has enough confirmations — check back shortly."
        )
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Wallet payment failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={pay}
        disabled={busy}
        className="w-full py-3 font-semibold rounded-xl transition-all"
        style={{
          background: "rgba(16,185,129,0.1)",
          color: "#10b981",
          border: "1px solid rgba(16,185,129,0.3)",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Processing…" : "Pay with USDC (Base)"}
      </button>
      {status && <p className="text-xs text-gray-400 text-center">{status}</p>}
    </div>
  )
}

/**
 * Default export: self-contained (wraps itself in the web3 provider). Import this
 * with next/dynamic({ ssr: false }). When the wallet rail isn't configured it
 * renders a clear disabled note instead.
 */
export default function WalletCheckout({ plan, onGranted }: { plan: PlanId; onGranted?: () => void }) {
  if (!isWalletConfigured()) {
    return (
      <p className="text-xs text-gray-500 text-center">
        Wallet payments are currently unavailable.
      </p>
    )
  }
  return (
    <Web3Provider>
      <WalletCheckoutInner plan={plan} onGranted={onGranted ?? (() => {})} />
    </Web3Provider>
  )
}
