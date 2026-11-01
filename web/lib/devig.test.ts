import { describe, expect, it } from "vitest"
import { devigMarket, expectedValuePerUnit, impliedProbability, isValidAmericanOdds } from "./devig"

describe("isValidAmericanOdds", () => {
  it("rejects prices strictly between -100 and +100", () => {
    expect(isValidAmericanOdds(-110)).toBe(true)
    expect(isValidAmericanOdds(100)).toBe(true)
    expect(isValidAmericanOdds(-100)).toBe(true)
    expect(isValidAmericanOdds(50)).toBe(false)
    expect(isValidAmericanOdds(-99)).toBe(false)
    expect(isValidAmericanOdds(Number.NaN)).toBe(false)
  })
})

describe("impliedProbability", () => {
  it("converts favourites and underdogs", () => {
    expect(impliedProbability(-110)).toBeCloseTo(110 / 210, 10)
    expect(impliedProbability(150)).toBeCloseTo(0.4, 10)
  })
})

describe("devigMarket", () => {
  it("removes a standard -110/-110 margin to 50/50", () => {
    const result = devigMarket([-110, -110])!
    expect(result.overround).toBeCloseTo(220 / 210, 10)
    expect(result.margin).toBeCloseTo(0.0476, 4)
    expect(result.outcomes[0].fairProbability).toBeCloseTo(0.5, 10)
    expect(result.outcomes[0].fairAmericanOdds).toBe(100)
  })

  it("fair probabilities always sum to 1, including 3-way markets", () => {
    for (const odds of [[-150, 130], [-200, 170], [150, 240, 210]]) {
      const sum = devigMarket(odds)!.outcomes.reduce((s, o) => s + o.fairProbability, 0)
      expect(sum).toBeCloseTo(1, 10)
    }
  })

  it("matches the engine's proportional method", () => {
    // Same arithmetic as backend devigProportional on decimal prices.
    const decimals = [1.667, 2.3]
    const raw = decimals.map((d) => 1 / d)
    const total = raw[0] + raw[1]
    const result = devigMarket([-150, 130])!
    expect(result.outcomes[0].fairProbability).toBeCloseTo(raw[0] / total, 3)
  })

  it("reproduces the worked example on /how-it-works", () => {
    const result = devigMarket([-130, 110])!
    expect(result.margin * 100).toBeCloseTo(4.1, 1)
    expect(result.outcomes[0].fairProbability * 100).toBeCloseTo(54.3, 1)
    expect(result.outcomes[1].fairProbability * 100).toBeCloseTo(45.7, 1)
  })

  it("returns null for input that cannot be one book's market", () => {
    expect(devigMarket([-110])).toBeNull()
    expect(devigMarket([-110, 50])).toBeNull()
    expect(devigMarket([200, 200])).toBeNull() // no margin to remove
  })
})

describe("expectedValuePerUnit", () => {
  it("is zero at the fair price and positive only above it", () => {
    expect(expectedValuePerUnit(0.5, 100)).toBeCloseTo(0, 10)
    expect(expectedValuePerUnit(0.5, 110)).toBeCloseTo(0.05, 10)
    expect(expectedValuePerUnit(0.5, -110)).toBeLessThan(0)
  })
})
