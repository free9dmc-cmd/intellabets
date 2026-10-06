/**
 * Self-custody web3 rail — USDC on Base, verified by TX HASH (no smart
 * contract). The server pins an order (expected amount + recipient + token +
 * optional payer wallet), the browser does an ERC-20 transfer itself, then
 * POSTs the tx hash to the confirm route, which calls verifyOnChainPayment.
 *
 * There is no webhook: nothing off-chain tells us the transfer happened, so
 * verifyWebhook is a no-op and all trust comes from reading the chain in
 * verifyOnChainPayment. Each verified payment grants ONE month (per-period).
 *
 * All assertions live in web3-verify.ts (pure, unit-tested). This file only
 * fetches the receipt/logs and maps the order to a NormalizedEvent.
 */
import { createPublicClient, http, parseEventLogs, erc20Abi } from "viem"
import { base, baseSepolia } from "viem/chains"
import { Prisma } from "@prisma/client"
import { prisma } from "../../prisma"
import type { PaymentProvider } from "../provider"
import type { CheckoutInput, CheckoutResult, NormalizedEvent, PlanId } from "../types"
import { planAmountCents } from "../pricing"
import { verifyOnChainTransfer, type ParsedTransfer } from "./web3-verify"

// Canonical USDC contracts (6 decimals) per chain, lowercased.
const USDC_DECIMALS = 6
const USDC_BY_CHAIN: Record<number, string> = {
  8453: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // Base mainnet
  84532: "0x036cbd53842c5426634e7929541ec2318f3dcf7e", // Base Sepolia
}

function isSandbox(): boolean {
  return process.env.WEB3_SANDBOX === "true"
}

function chainId(): number {
  return isSandbox() ? baseSepolia.id : base.id
}

function usdcAddress(): string {
  return USDC_BY_CHAIN[chainId()]
}

function recipient(): string | null {
  const addr = process.env.WEB3_RECEIVING_ADDRESS
  return addr ? addr.toLowerCase() : null
}

function minConfirmations(): number {
  const n = Number(process.env.WEB3_CONFIRMATIONS)
  return Number.isFinite(n) && n > 0 ? n : 3
}

/** cents -> USDC base units (6 decimals): $19.99 (1999c) -> 19_990_000. */
function centsToUsdcBaseUnits(cents: number): bigint {
  // 10 ^ (USDC_DECIMALS - 2) = 10 ^ 4 = 10000. Written without a BigInt literal
  // or exponentiation so it compiles under the project's default tsc target.
  const centToBaseUnitFactor = BigInt(10000)
  return BigInt(cents) * centToBaseUnitFactor
}

// A USDC price in cents occupies the base-unit value *10^4, leaving the lowest
// four decimal digits (up to 9999 slots, all BELOW one cent) free for a
// per-order nonce. Adding a unique nonce to the price makes every PENDING
// order's on-chain amount distinct, so an exact-amount Transfer settles exactly
// one order — the core of the H1 claim-jacking fix.
const MAX_NONCE = 9999
// How many distinct amounts to try before giving up (collisions are rare; this
// is a safety bound, not an expected cost).
const MAX_AMOUNT_ATTEMPTS = 16

function randomNonce(): number {
  // [1, 9999] — never 0, so the amount is always strictly above the bare price.
  return 1 + Math.floor(Math.random() * MAX_NONCE)
}

function publicClient() {
  const rpcUrl = process.env.WEB3_RPC_URL
  return createPublicClient({
    chain: isSandbox() ? baseSepolia : base,
    transport: http(rpcUrl), // undefined rpcUrl falls back to the chain's default
  })
}

export const web3Provider: PaymentProvider = {
  id: "web3",
  label: "Self-custody wallet (USDC on Base)",

  isConfigured() {
    // Needs a receiving address (to be paid) and an RPC URL (to verify payment).
    return Boolean(process.env.WEB3_RECEIVING_ADDRESS && process.env.WEB3_RPC_URL)
  },

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const to = recipient()
    const token = usdcAddress()
    if (!to || !token) return { kind: "unsupported", reason: "web3 not configured" }

    const amountCents = planAmountCents(input.plan)
    const baseUnits = centsToUsdcBaseUnits(amountCents)
    const fromAddress = input.walletAddress ? input.walletAddress.toLowerCase() : null

    // Allocate a PENDING order with a per-order UNIQUE on-chain amount. We pick a
    // random sub-cent nonce, confirm no other live (pending) order for the same
    // token+recipient already claims that exact amount, then insert. On a race
    // (a concurrent order grabbed the same amount, or a unique constraint trips)
    // we retry with a fresh nonce. Exact-amount matching at verify time then
    // binds a Transfer to exactly this order.
    let order = null
    for (let attempt = 0; attempt < MAX_AMOUNT_ATTEMPTS; attempt++) {
      const expectedAmount = (baseUnits + BigInt(randomNonce())).toString()

      const clash = await prisma.paymentOrder.findFirst({
        where: {
          provider: "web3",
          status: "pending",
          tokenAddress: token,
          recipient: to,
          expectedAmount,
        },
        select: { id: true },
      })
      if (clash) continue

      try {
        order = await prisma.paymentOrder.create({
          data: {
            provider: "web3",
            plan: input.plan,
            userId: input.userId,
            expectedAmount,
            currency: "usdc",
            chainId: chainId(),
            tokenAddress: token,
            recipient: to,
            fromAddress,
          },
        })
        break
      } catch (err) {
        // Defensive: if a DB-level unique ever guards the amount, retry on it.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          continue
        }
        throw err
      }
    }

    if (!order) {
      return { kind: "unsupported", reason: "could not allocate a unique payment amount" }
    }

    return {
      kind: "wallet",
      chainId: chainId(),
      tokenAddress: token,
      // Return the EXACT per-order amount the client must transfer. The wallet
      // UI transfers precisely this; verify requires an exact match.
      amount: order.expectedAmount,
      recipient: to,
      orderId: order.id,
      decimals: USDC_DECIMALS,
    }
  },

  async cancelSubscription(): Promise<{ ok: boolean }> {
    return { ok: true }
  },

  // No off-chain webhook for self-custody payments.
  async verifyWebhook(): Promise<NormalizedEvent | null> {
    return null
  },

  async verifyOnChainPayment(
    txHash: string,
    orderId: string
  ): Promise<NormalizedEvent | null> {
    const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } })
    if (!order || order.provider !== "web3" || !order.tokenAddress || !order.recipient) {
      return null
    }
    // Already settled by a prior confirmation — let idempotency dedupe handle it.
    if (order.status === "paid" && order.txHash && order.txHash.toLowerCase() !== txHash.toLowerCase()) {
      return null
    }

    const client = publicClient()

    let receipt
    try {
      receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` })
    } catch (err) {
      console.error("web3 verify: receipt fetch failed", txHash, err)
      return null
    }

    const currentBlock = await client.getBlockNumber()
    const confirmations = Number(currentBlock - receipt.blockNumber) + 1

    const parsed = parseEventLogs({
      abi: erc20Abi,
      eventName: "Transfer",
      logs: receipt.logs,
    })
    const transfers: ParsedTransfer[] = parsed.map((log) => ({
      token: (log.address as string).toLowerCase(),
      from: (log.args.from as string).toLowerCase(),
      to: (log.args.to as string).toLowerCase(),
      value: log.args.value as bigint,
    }))

    const outcome = verifyOnChainTransfer({
      receiptStatus: receipt.status,
      transfers,
      confirmations,
      minConfirmations: minConfirmations(),
      expected: {
        tokenAddress: order.tokenAddress,
        recipient: order.recipient,
        expectedAmount: BigInt(order.expectedAmount),
        fromAddress: order.fromAddress,
      },
    })

    if (!outcome.ok) {
      console.error("web3 verify REJECTED", txHash, orderId, outcome.reason)
      return null
    }

    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: "paid", paidAt: new Date(), txHash },
    })

    return {
      provider: "web3",
      // Idempotency keyed by the tx hash: one settled tx can grant only once.
      eventId: txHash.toLowerCase(),
      type: "onchain.transfer.confirmed",
      action: "grant",
      plan: order.plan as PlanId,
      userId: order.userId,
      recurring: false,
      periodMonths: 1,
      raw: { txHash, orderId },
    }
  },
}
