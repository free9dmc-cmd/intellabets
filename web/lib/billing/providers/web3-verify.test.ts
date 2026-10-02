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
const EXPECTED_AMOUNT = BigInt(19990000)

const expected: ExpectedPayment = {
  tokenAddress: USDC,
  recipient: RECIPIENT,
  minAmount: EXPECTED_AMOUNT,
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

  it("accepts an overpayment (value greater than expected)", () => {
    const transfers = [goodTransfer({ value: EXPECTED_AMOUNT + BigInt(1) })]
    expect(findSettlingTransfer(transfers, expected)).not.toBeNull()
  })

  it("finds the right transfer among unrelated ones", () => {
    const transfers = [
      goodTransfer({ token: "0xdeadbeef", to: RECIPIENT }), // wrong token
      goodTransfer({ to: "0xsomeoneelse" }), // wrong recipient
      goodTransfer(), // the real one
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
