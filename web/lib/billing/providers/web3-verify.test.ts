import { describe, it, expect } from "vitest"
import {
  verifyOnChainTransfer,
  findSettlingTransfer,
  type ParsedTransfer,
  type ExpectedPayment,
} from "./web3-verify"

/**
 * The money path for self-custody payments. These prove we grant ONLY on a real,
 * matching, confirmed transfer and FAIL CLOSED on every mismatch. Amounts are in
 * USDC base units (6 decimals): $19.99 = 19_990_000.
 */
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
const RECIPIENT = "0xReceiverAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".toLowerCase()
const PAYER = "0xPayerBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB".toLowerCase()
// Per-order UNIQUE amount: the $19.99 base-unit price (19_990_000) plus a sub-cent
// nonce. Each live order gets a distinct value in those low digits.
const EXPECTED_AMOUNT = BigInt(19990042)
// A DIFFERENT order's unique amount (same plan/price, different nonce) — what an
// attacker's own order would carry.
const OTHER_ORDER_AMOUNT = BigInt(19990777)

const expected: ExpectedPayment = {
  tokenAddress: USDC,
  recipient: RECIPIENT,
  expectedAmount: EXPECTED_AMOUNT,
}

/** A correct, qualifying USDC Transfer to our recipient. */
function goodTransfer(overrides: Partial<ParsedTransfer> = {}): ParsedTransfer {
  return {
    token: USDC,
    from: PAYER,
    to: RECIPIENT,
    value: EXPECTED_AMOUNT,
    ...overrides,
  }
}

describe("findSettlingTransfer", () => {
  it("matches a correct transfer (and is case-insensitive on addresses)", () => {
    const transfers = [goodTransfer({ token: USDC.toUpperCase(), to: RECIPIENT.toUpperCase() })]
    expect(findSettlingTransfer(transfers, expected)).not.toBeNull()
  })

  it("REJECTS an overpayment (exact match required, not >=)", () => {
    // With per-order unique amounts, anything but the exact value is ambiguous
    // (it may belong to a different order), so even an overpayment must not match.
    const transfers = [goodTransfer({ value: EXPECTED_AMOUNT + BigInt(1) })]
    expect(findSettlingTransfer(transfers, expected)).toBeNull()
  })

  it("H1 claim-jack: a transfer carrying a DIFFERENT order's amount does NOT settle this order", () => {
    // The attacker replays a victim's real USDC transfer (to our one recipient,
    // correct token) whose value is the VICTIM's unique order amount, trying to
    // settle their own same-price order. Exact matching rejects it.
    const victimTransfer = goodTransfer({ value: OTHER_ORDER_AMOUNT })
    expect(findSettlingTransfer([victimTransfer], expected)).toBeNull()
  })

  it("H1: an exact-amount transfer DOES settle the matching order", () => {
    expect(findSettlingTransfer([goodTransfer({ value: EXPECTED_AMOUNT })], expected)).not.toBeNull()
  })

  it("finds the right transfer among unrelated ones", () => {
    const transfers = [
      goodTransfer({ token: "0xdeadbeef", to: RECIPIENT }), // wrong token
      goodTransfer({ to: "0xsomeoneelse" }), // wrong recipient
      goodTransfer({ value: OTHER_ORDER_AMOUNT }), // another order's exact amount
      goodTransfer(), // the real one (exact amount)
    ]
    expect(findSettlingTransfer(transfers, expected)).not.toBeNull()
  })

  it("enforces from-address when the order pins one", () => {
    const pinned: ExpectedPayment = { ...expected, fromAddress: PAYER }
    expect(findSettlingTransfer([goodTransfer()], pinned)).not.toBeNull()
    expect(findSettlingTransfer([goodTransfer({ from: "0xattacker" })], pinned)).toBeNull()
  })
})

describe("verifyOnChainTransfer", () => {
  const base = {
    receiptStatus: "success" as const,
    transfers: [goodTransfer()],
    confirmations: 5,
    minConfirmations: 3,
    expected,
  }

  it("PASSES on correct token / recipient / amount, success, enough confirmations", () => {
    expect(verifyOnChainTransfer(base)).toEqual({ ok: true })
  })

  it("FAILS on wrong token", () => {
    const out = verifyOnChainTransfer({ ...base, transfers: [goodTransfer({ token: "0xdeadbeef" })] })
    expect(out.ok).toBe(false)
  })

  it("FAILS on wrong recipient", () => {
    const out = verifyOnChainTransfer({ ...base, transfers: [goodTransfer({ to: "0xwrong" })] })
    expect(out.ok).toBe(false)
  })

  it("FAILS on insufficient amount (underpayment)", () => {
    const out = verifyOnChainTransfer({
      ...base,
      transfers: [goodTransfer({ value: EXPECTED_AMOUNT - BigInt(1) })],
    })
    expect(out.ok).toBe(false)
  })

  it("H1: PASSES on the EXACT per-order amount", () => {
    const out = verifyOnChainTransfer({ ...base, transfers: [goodTransfer({ value: EXPECTED_AMOUNT })] })
    expect(out.ok).toBe(true)
  })

  it("H1: FAILS on an overpayment (exact match required)", () => {
    const out = verifyOnChainTransfer({
      ...base,
      transfers: [goodTransfer({ value: EXPECTED_AMOUNT + BigInt(1) })],
    })
    expect(out.ok).toBe(false)
  })

  it("H1 claim-jack: FAILS when the transfer carries a DIFFERENT order's amount", () => {
    const out = verifyOnChainTransfer({
      ...base,
      transfers: [goodTransfer({ value: OTHER_ORDER_AMOUNT })],
    })
    expect(out.ok).toBe(false)
  })

  it("FAILS on a reverted transaction even if the logs look right", () => {
    const out = verifyOnChainTransfer({ ...base, receiptStatus: "reverted" })
    expect(out.ok).toBe(false)
    expect(out.reason).toMatch(/revert/i)
  })

  it("FAILS when there are no Transfer logs at all", () => {
    const out = verifyOnChainTransfer({ ...base, transfers: [] })
    expect(out.ok).toBe(false)
  })

  it("FAILS on too few confirmations", () => {
    const out = verifyOnChainTransfer({ ...base, confirmations: 1, minConfirmations: 3 })
    expect(out.ok).toBe(false)
    expect(out.reason).toMatch(/confirmation/i)
  })

  it("FAILS when a pinned from-address does not match", () => {
    const out = verifyOnChainTransfer({
      ...base,
      expected: { ...expected, fromAddress: PAYER },
      transfers: [goodTransfer({ from: "0xattacker" })],
    })
    expect(out.ok).toBe(false)
  })
})
