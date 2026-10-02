/**
 * Pure on-chain payment verification logic, with NO network or env, so the
 * money-path assertions can be unit-tested exhaustively. web3.ts feeds this the
 * decoded receipt + Transfer logs; this decides whether the payment is real.
 *
 * The cardinal rule: we grant access ONLY when a verified ERC-20 Transfer on
 * the expected token moved EXACTLY the expected amount to our recipient in a
 * successful, sufficiently-confirmed transaction. The exact-amount match is the
 * security boundary: each order is created with a per-order unique amount (the
 * plan price plus a sub-cent nonce), so a given Transfer can settle exactly one
 * order and an attacker cannot claim-jack someone else's payment against their
 * own same-price order. A pinned `from` address is optional extra defense only
 * (it is client-supplied). Anything else FAILS CLOSED.
 */

/** A Transfer log, already decoded and normalised to lowercase addresses. */
export interface ParsedTransfer {
  /** The token contract that emitted the Transfer (lowercased). */
  token: string
  from: string
  to: string
  value: bigint
}

/** What the server-created order says must be true of the payment. */
export interface ExpectedPayment {
  /** USDC contract on the expected chain (lowercased). */
  tokenAddress: string
  /** Our single receiving address (lowercased). */
  recipient: string
  /**
   * The EXACT token base units that must reach the recipient. This is the
   * per-order unique amount; a Transfer must equal it exactly (not merely meet
   * it) to settle the order. Exact matching is what binds a payment to one order.
   */
  expectedAmount: bigint
  /**
   * Optional extra defense only: if set, the Transfer's `from` must equal this
   * (lowercased). It is client-supplied, so it is NOT the security boundary.
   */
  fromAddress?: string | null
}

export interface VerifyInput {
  /** Transaction receipt status: must be "success" (not "reverted"). */
  receiptStatus: "success" | "reverted"
  /** All Transfer logs decoded from the receipt. */
  transfers: ParsedTransfer[]
  /** How many confirmations the tx currently has. */
  confirmations: number
  /** Required confirmations before we trust it. */
  minConfirmations: number
  expected: ExpectedPayment
}

export interface VerifyOutcome {
  ok: boolean
  reason?: string
}

function lc(s: string): string {
  return s.toLowerCase()
}

/**
 * Find a Transfer in the receipt that satisfies every expectation. Returns the
 * matching transfer or null. Comparisons are case-insensitive on addresses and
 * EXACT (BigInt `===`) on amount: a Transfer must move precisely the order's
 * per-order unique amount — neither less (underpayment) nor more (which would
 * belong to, or be ambiguous with, a different order). Exact matching is the
 * security boundary against claim-jacking.
 */
export function findSettlingTransfer(
  transfers: ParsedTransfer[],
  expected: ExpectedPayment
): ParsedTransfer | null {
  const token = lc(expected.tokenAddress)
  const recipient = lc(expected.recipient)
  const from = expected.fromAddress ? lc(expected.fromAddress) : null
  for (const t of transfers) {
    if (lc(t.token) !== token) continue
    if (lc(t.to) !== recipient) continue
    if (from && lc(t.from) !== from) continue
    if (t.value !== expected.expectedAmount) continue
    return t
  }
  return null
}

/**
 * Full verification gate. Checks, in order: the tx succeeded, it has enough
 * confirmations, and a qualifying Transfer exists. Every failure is explicit so
 * the caller can log WHY a payment was rejected without ever granting on doubt.
 */
export function verifyOnChainTransfer(input: VerifyInput): VerifyOutcome {
  if (input.receiptStatus !== "success") {
    return { ok: false, reason: "transaction reverted" }
  }
  if (input.confirmations < input.minConfirmations) {
    return {
      ok: false,
      reason: `insufficient confirmations (${input.confirmations}/${input.minConfirmations})`,
    }
  }
  const match = findSettlingTransfer(input.transfers, input.expected)
  if (!match) {
    return { ok: false, reason: "no matching Transfer (token/recipient/amount/from)" }
  }
  return { ok: true }
}
