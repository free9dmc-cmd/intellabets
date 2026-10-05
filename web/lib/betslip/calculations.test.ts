import { describe, expect, it } from "vitest"
import { americanToDecimal } from "@/lib/utils"
import { calcBetslipTotals, calcTotalOdds, parseAmericanOdds, parseStake } from "./calculations"

/**
 * These tests answer three different questions:
 *
 *  1. "Is the maths right?"  → hand-checked values from standard sportsbook payouts.
 *  2. "Did valid input keep working exactly as before?" → compare against the
 *     ORIGINAL inline code from betslips/new/page.tsx, copied below as an oracle
 *     (a "characterization test").
 *  3. "What happens to input that used to be silently papered over?" → each case
 *     is listed explicitly, so the behavior change is visible in review.
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
})

describe("calcBetslipTotals", () => {
  it("returns stake x decimal odds as the potential return", () => {
    // $100 on +264 returns the $100 stake plus $264 profit.
    const totals = calcBetslipTotals([{ odds: "-110" }, { odds: "-110" }], "100")
    expect(totals).toEqual({ totalOdds: 264, stake: 100, potentialReturn: 364 })
  })
})

describe("parseAmericanOdds", () => {
  it.each([
    ["-110", -110],
    ["+150", 150],
    ["150", 150],
    [" -110 ", -110],
    ["100", 100],
    ["-100", -100],
    ["-110.5", -110.5],
  ])("accepts %j", (input, expected) => {
    expect(parseAmericanOdds(input)).toBe(expected)
  })

  it.each([
    ["", "empty"],
    ["   ", "whitespace"],
    ["abc", "not a number"],
    ["-110abc", "trailing text (parseFloat used to read this as -110)"],
    ["−110", "typographic minus sign"],
    ["0", "zero is not a price"],
    ["50", "between -100 and +100 is not a real American price"],
    ["-99", "between -100 and +100 is not a real American price"],
    ["1e3", "scientific notation is not something to type into odds"],
    ["1,000", "thousands separator"],
    ["+-110", "double sign"],
  ])("rejects %j (%s)", (input) => {
    expect(parseAmericanOdds(input)).toBeNull()
  })
})

describe("parseStake", () => {
  it.each([
    ["50", 50],
    ["12.5", 12.5],
    [" 25 ", 25],
    ["1e2", 100], // a number input can produce this
  ])("accepts %j", (input, expected) => {
    expect(parseStake(input)).toBe(expected)
  })

  it.each([["", "empty"], ["abc", "not a number"], ["0", "zero"], ["-5", "negative"], ["-0", "negative zero"]])(
    "rejects %j (%s)",
    (input) => {
      expect(parseStake(input)).toBeNull()
    }
  )
})

// ─── 2. did valid input keep working exactly as before? ───────────────────────

describe("valid input matches the original inline implementation", () => {
  const validOdds: string[][] = [
    ["-110"],
    ["+150"],
    ["150"],
    ["-110", "-110"],
    ["+100", "+100", "+100"],
    ["-200", "+300", "-150"],
    [" -110 "],
    ["-110", "-105", "+250", "-180"],
  ]
  const validStakes = ["100", "50", "12.345", "1e2", "0.01", "9999"]

  it("totals for every valid odds/stake combination", () => {
    for (const legs of validOdds) {
      for (const stake of validStakes) {
        const bets = legs.map((odds) => ({ odds }))
        expect(
          calcBetslipTotals(bets, stake),
          `legs=${JSON.stringify(legs)} stake=${JSON.stringify(stake)}`
        ).toEqual(legacyTotals(bets, stake))
      }
    }
  })
})

// ─── 3. input that used to be silently papered over ───────────────────────────
// Each of these used to produce a plausible-looking number from data nobody entered.

describe("input that used to be silently substituted now reports 'unknown'", () => {
  it("a missing or invalid stake is null, not a quiet $100", () => {
    expect(calcBetslipTotals([{ odds: "-110" }], "").stake).toBeNull()
    expect(calcBetslipTotals([{ odds: "-110" }], "abc").stake).toBeNull()
    expect(calcBetslipTotals([{ odds: "-110" }], "0").stake).toBeNull() // used to become 100
    expect(legacyTotals([{ odds: "-110" }], "").stake).toBe(100) // what it used to do
  })

  it("no usable odds means no total and no return, not a return estimated at -110", () => {
    const totals = calcBetslipTotals([{ odds: "" }], "100")
    expect(totals).toEqual({ totalOdds: null, stake: 100, potentialReturn: null })
    expect(legacyTotals([{ odds: "" }], "100").potentialReturn).toBeCloseTo(190.909, 3) // what it used to show
  })

  it("one bad leg makes the total unknown instead of silently dropping that leg", () => {
    expect(calcTotalOdds(["-110", "", "abc"])).toBeNull()
    expect(legacyCalcTotalOdds([{ odds: "-110" }, { odds: "" }, { odds: "abc" }])).toBe(-110) // used to
  })

  it("odds that aren't real prices no longer produce Infinity", () => {
    expect(calcTotalOdds(["0"])).toBeNull()
    expect(calcTotalOdds(["50"])).toBeNull()
    expect(legacyCalcTotalOdds([{ odds: "0" }])).toBe(Infinity) // used to
  })

  it("an empty betslip has no total", () => {
    expect(calcTotalOdds([])).toBeNull()
  })

  it("a known stake alone doesn't invent a return", () => {
    expect(calcBetslipTotals([{ odds: "nope" }], "50")).toEqual({
      totalOdds: null,
      stake: 50,
      potentialReturn: null,
    })
  })
})
