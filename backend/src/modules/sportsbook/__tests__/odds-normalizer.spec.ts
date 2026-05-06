import {
  americanToDecimal,
  decimalToAmerican,
  fractionalToDecimal,
  decimalToFractional,
  impliedProbability,
  removeVig,
  normalizeOdds,
  fromAmerican,
  fromDecimal,
  fromFractional,
  normalizeMarketName,
} from "../utils/odds-normalizer"

describe("americanToDecimal", () => {
  it("converts positive American odds", () => {
    expect(americanToDecimal(150)).toBeCloseTo(2.5)
    expect(americanToDecimal(100)).toBeCloseTo(2.0)
    expect(americanToDecimal(300)).toBeCloseTo(4.0)
  })

  it("converts negative American odds", () => {
    expect(americanToDecimal(-110)).toBeCloseTo(1.909, 2)
    expect(americanToDecimal(-200)).toBeCloseTo(1.5)
    expect(americanToDecimal(-300)).toBeCloseTo(1.333, 2)
  })

  it("throws for zero", () => {
    expect(() => americanToDecimal(0)).toThrow(RangeError)
  })
})

describe("decimalToAmerican", () => {
  it("converts decimal >= 2 to positive American", () => {
    expect(decimalToAmerican(2.5)).toBe(150)
    expect(decimalToAmerican(4.0)).toBe(300)
  })

  it("converts decimal < 2 to negative American", () => {
    expect(decimalToAmerican(1.5)).toBe(-200)
    expect(decimalToAmerican(1.909)).toBeCloseTo(-110, 0)
  })

  it("throws for decimal <= 1", () => {
    expect(() => decimalToAmerican(1)).toThrow(RangeError)
    expect(() => decimalToAmerican(0.5)).toThrow(RangeError)
  })
})

describe("fractionalToDecimal", () => {
  it("converts common fractional odds", () => {
    expect(fractionalToDecimal("3/2")).toBeCloseTo(2.5)
    expect(fractionalToDecimal("1/1")).toBeCloseTo(2.0)
    expect(fractionalToDecimal("10/11")).toBeCloseTo(1.909, 2)
    expect(fractionalToDecimal("2/1")).toBeCloseTo(3.0)
  })

  it("throws for invalid format", () => {
    expect(() => fractionalToDecimal("abc")).toThrow()
    expect(() => fractionalToDecimal("3")).toThrow()
  })
})

describe("decimalToFractional", () => {
  it("converts common decimal odds to fractional", () => {
    expect(decimalToFractional(2.5)).toBe("3/2")
    expect(decimalToFractional(2.0)).toBe("1/1")
    expect(decimalToFractional(3.0)).toBe("2/1")
  })

  it("throws for decimal <= 1", () => {
    expect(() => decimalToFractional(0.9)).toThrow(RangeError)
  })
})

describe("impliedProbability", () => {
  it("calculates correct implied probability", () => {
    expect(impliedProbability(2.0)).toBeCloseTo(0.5)
    expect(impliedProbability(2.5)).toBeCloseTo(0.4)
    expect(impliedProbability(1.5)).toBeCloseTo(0.6667, 3)
  })

  it("throws for zero or negative", () => {
    expect(() => impliedProbability(0)).toThrow(RangeError)
    expect(() => impliedProbability(-1)).toThrow(RangeError)
  })
})

describe("removeVig", () => {
  it("removes vig from a balanced market", () => {
    // Standard -110/-110 line has overround ~1.048
    const rawProbs = [1 / 1.909, 1 / 1.909]
    const fair = removeVig(rawProbs)
    expect(fair[0]).toBeCloseTo(0.5, 2)
    expect(fair[1]).toBeCloseTo(0.5, 2)
    expect(fair[0] + fair[1]).toBeCloseTo(1.0, 4)
  })

  it("removes vig from a skewed market", () => {
    const rawProbs = [americanToDecimal, americanToDecimal].map((_, i) =>
      i === 0 ? 1 / americanToDecimal(-200) : 1 / americanToDecimal(160)
    )
    const fair = removeVig(rawProbs)
    expect(fair.reduce((s, p) => s + p, 0)).toBeCloseTo(1.0, 4)
  })
})

describe("normalizeOdds", () => {
  it("normalises American format end-to-end", () => {
    const result = normalizeOdds({ format: "american", value: 150 })
    expect(result.american).toBe(150)
    expect(result.decimal).toBeCloseTo(2.5, 2)
    expect(result.fractional).toBe("3/2")
    expect(result.impliedProbability).toBeCloseTo(0.4, 2)
  })

  it("normalises decimal format end-to-end", () => {
    const result = normalizeOdds({ format: "decimal", value: 2.5 })
    expect(result.decimal).toBeCloseTo(2.5, 2)
    expect(result.american).toBe(150)
    expect(result.impliedProbability).toBeCloseTo(0.4, 2)
  })

  it("normalises fractional format end-to-end", () => {
    const result = normalizeOdds({ format: "fractional", value: "3/2" })
    expect(result.decimal).toBeCloseTo(2.5, 2)
    expect(result.american).toBe(150)
    expect(result.impliedProbability).toBeCloseTo(0.4, 2)
  })

  it("round-trips American → decimal → American within ±1", () => {
    const odds = [-300, -200, -150, -110, 100, 110, 150, 200, 300, 500]
    odds.forEach((o) => {
      const { american } = fromAmerican(o)
      expect(Math.abs(american - o)).toBeLessThanOrEqual(1)
    })
  })
})

describe("normalizeMarketName", () => {
  it("maps known aliases to canonical names", () => {
    expect(normalizeMarketName("h2h")).toBe("moneyline")
    expect(normalizeMarketName("ML")).toBe("moneyline")
    expect(normalizeMarketName("spreads")).toBe("spread")
    expect(normalizeMarketName("totals")).toBe("total")
    expect(normalizeMarketName("Over/Under")).toBe("total")
  })

  it("passes through unknown market names unchanged", () => {
    expect(normalizeMarketName("custom_market")).toBe("custom_market")
  })
})

describe("shorthand helpers", () => {
  it("fromAmerican produces correct decimal", () => {
    expect(fromAmerican(-110).decimal).toBeCloseTo(1.909, 2)
  })

  it("fromDecimal produces correct American", () => {
    expect(fromDecimal(2.5).american).toBe(150)
  })

  it("fromFractional produces correct decimal", () => {
    expect(fromFractional("3/2").decimal).toBeCloseTo(2.5, 2)
  })
})
