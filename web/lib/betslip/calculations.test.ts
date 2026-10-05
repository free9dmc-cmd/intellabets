import { describe, expect, it } from "vitest"
import { americanToDecimal } from "@/lib/utils"
import {
  DEFAULT_STAKE,
  FALLBACK_ODDS,
  calcBetslipTotals,
  calcTotalOdds,
  parseStake,
} from "./calculations"

/**
 * These tests answer two different questions:
 *
 *  1. "Is the maths right?"  → hand-checked values from standard sportsbook payouts.
 *  2. "Did the refactor change behavior?" → compare against the ORIGINAL inline
 *     code from betslips/new/page.tsx, copied below verbatim as an oracle.
 *
 * The second kind is called a characterization test. It pins down what code
 * *does*, flaws included, so a refactor can be proven to be a pure refactor.
 * When a flaw is deliberately fixed later, the matching expectation changes
 * in that same commit — which makes the behavior change visible in review.
 */

// ─── oracle: original implementation, copied verbatim ─────────────────────────

function legacyCalcTotalOdds(bets: { odds: string }[]): number {
  try {
    const decimal = bets.reduce((acc, bet) => {
      const odds = parseFloat(bet.odds)
      if (isNaN(odds)) return acc
      return acc * americanToDecimal(odds)
    }, 1)
    if (decimal <= 1) return 0
    const american = decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1))
    return american
  } catch {
    return 0
  }
}

function legacyTotals(bets: { odds: string }[], stake: string) {
  const totalOdds = legacyCalcTotalOdds(bets)
  const stakeNum = parseFloat(stake) || 100
  const potentialReturn = stakeNum * americanToDecimal(totalOdds || -110)
  return { totalOdds, stake: stakeNum, potentialReturn }
}

// ─── 1. is the maths right? ───────────────────────────────────────────────────

describe("calcTotalOdds — known payouts", () => {
  it.each([
    { legs: ["-110"], expected: -110, note: "a single leg is unchanged" },
    { legs: ["+150"], expected: 150, note: "a leading + is accepted" },
    { legs: ["-110", "-110"], expected: 264, note: "the classic two-team -110 parlay" },
    { legs: ["+100", "+100", "+100"], expected: 700, note: "2 x 2 x 2 = 8.0 decimal" },
    { legs: ["-200", "-200"], expected: 125, note: "1.5 x 1.5 = 2.25 decimal" },
  ])("$legs → $expected ($note)", ({ legs, expected }) => {
    expect(calcTotalOdds(legs)).toBe(expected)
  })

  it("skips legs that can't be parsed instead of failing", () => {
    expect(calcTotalOdds(["-110", "", "abc"])).toBe(-110)
  })

  it("returns 0 when there is nothing to combine", () => {
    expect(calcTotalOdds([])).toBe(0)
    expect(calcTotalOdds(["", "abc"])).toBe(0)
  })
})

describe("parseStake", () => {
  it("parses ordinary and decimal stakes", () => {
    expect(parseStake("50")).toBe(50)
    expect(parseStake("12.5")).toBe(12.5)
  })

  it("falls back to DEFAULT_STAKE for empty or non-numeric input", () => {
    expect(parseStake("")).toBe(DEFAULT_STAKE)
    expect(parseStake("abc")).toBe(DEFAULT_STAKE)
  })
})

describe("calcBetslipTotals", () => {
  it("returns stake x decimal odds as the potential return", () => {
    // $100 on +264 returns the $100 stake plus $264 profit.
    const totals = calcBetslipTotals([{ odds: "-110" }, { odds: "-110" }], "100")
    expect(totals).toEqual({ totalOdds: 264, stake: 100, potentialReturn: 364 })
  })

  it("estimates the return from FALLBACK_ODDS when no leg has usable odds", () => {
    const totals = calcBetslipTotals([{ odds: "" }], "100")
    expect(totals.totalOdds).toBe(0)
    expect(totals.potentialReturn).toBeCloseTo(100 * americanToDecimal(FALLBACK_ODDS), 10)
  })
})

// ─── 2. did the refactor change behavior? ─────────────────────────────────────

describe("matches the original inline implementation", () => {
  // Deliberately includes inputs a user can really type, plus awkward ones.
  const oddsCases: string[][] = [
    ["-110"],
    ["+150"],
    ["150"],
    ["-110", "-110"],
    ["+100", "+100", "+100"],
    ["-200", "+300", "-150"],
    ["-110", "", "abc"],
    ["", ""],
    [],
    ["0"], // not valid American odds, but typeable
    ["-0"],
    ["50"], // American odds can't be between -100 and +100
    ["1e3"], // parseFloat reads scientific notation
    ["−110"], // typographic minus sign: unparseable
    [" -110 "],
    ["-110abc"], // parseFloat stops at the first bad character
  ]
  const stakeCases = ["100", "", "abc", "0", "-0", "50", "12.345", "-5", "1e2"]

  it.each(oddsCases.map((legs) => ({ legs })))("odds $legs", ({ legs }) => {
    const bets = legs.map((odds) => ({ odds }))
    expect(calcTotalOdds(legs)).toBe(legacyCalcTotalOdds(bets))
  })

  it("totals for every odds/stake combination", () => {
    for (const legs of oddsCases) {
      for (const stake of stakeCases) {
        const bets = legs.map((odds) => ({ odds }))
        expect(
          calcBetslipTotals(bets, stake),
          `legs=${JSON.stringify(legs)} stake=${JSON.stringify(stake)}`
        ).toEqual(legacyTotals(bets, stake))
      }
    }
  })
})
