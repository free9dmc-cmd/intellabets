import { describe, expect, it } from "vitest"
import {
  americanFromDecimal,
  copyProblem,
  defaultSelection,
  eligibleCandidates,
  inRiskBand,
  parlayMath,
  slipProblem,
  upcomingGameCount,
  type SlipCandidate,
} from "./ai-picks"

const NOW = Date.parse("2026-10-25T12:00:00Z")
const LATER = "2026-10-25T20:00:00Z"
const EARLIER = "2026-10-25T11:00:00Z"

let n = 0
function pick(gameId: string, marketType: string, overrides: Partial<SlipCandidate> = {}): SlipCandidate {
  n += 1
  return {
    id: `p${n}`,
    gameId,
    outcomeId: `${gameId}:${marketType}:${n}`,
    marketType,
    selection: `Pick ${n}`,
    fairProbability: 0.55,
    offeredOdds: 1.91,
    offeredBook: "fanduel",
    edgePercent: -2.1,
    confidence: 70,
    game: { sport: "NFL", homeTeam: "H", awayTeam: "A", commenceTime: LATER },
    ...overrides,
  }
}

describe("eligibleCandidates", () => {
  it("drops games that have started and repeated outcomes", () => {
    const a = pick("g1", "spread")
    const started = pick("g2", "spread", { game: { ...a.game, commenceTime: EARLIER } })
    const dupe = { ...a, id: "other" }
    expect(eligibleCandidates([a, started, dupe], "parlay", 2, NOW).map((p) => p.id)).toEqual([a.id])
  })

  it("keeps only games with enough distinct markets for a same-game parlay", () => {
    const g1a = pick("g1", "spread")
    const g1b = pick("g1", "spread") // same market again: not combinable
    const g2a = pick("g2", "spread")
    const g2b = pick("g2", "total")
    const out = eligibleCandidates([g1a, g1b, g2a, g2b], "same-game-parlay", 2, NOW)
    expect(out.map((p) => p.id)).toEqual([g2a.id, g2b.id])
  })
})

describe("same-game parlay markets", () => {
  it("never pairs a moneyline with a spread from one game", () => {
    const ml = pick("g1", "moneyline")
    const spread = pick("g1", "spread")
    const total = pick("g1", "total")
    expect(eligibleCandidates([ml, spread, total], "same-game-parlay", 2, NOW).map((p) => p.id)).toEqual([ml.id, total.id])
    expect(slipProblem([ml, spread], "same-game-parlay", 2)).toMatch(/moneyline with a spread/)
  })
})

describe("slipProblem", () => {
  it("rejects two legs from one game in a regular parlay", () => {
    expect(slipProblem([pick("g1", "spread"), pick("g1", "total")], "parlay", 2)).toMatch(/one game/)
  })

  it("rejects mixed games in a same-game parlay", () => {
    expect(slipProblem([pick("g1", "spread"), pick("g2", "total")], "same-game-parlay", 2)).toMatch(/mixes games/)
  })

  it("rejects the wrong number of legs and repeats", () => {
    const a = pick("g1", "spread")
    expect(slipProblem([a], "parlay", 2)).toMatch(/exactly 2/)
    expect(slipProblem([a, a], "parlay", 2)).toMatch(/repeats/)
  })

  it("accepts a legal parlay", () => {
    expect(slipProblem([pick("g1", "spread"), pick("g2", "total")], "parlay", 2)).toBeNull()
  })
})

describe("defaultSelection", () => {
  it("takes the top-ranked legs from different games", () => {
    const a = pick("g1", "spread")
    const b = pick("g1", "total")
    const c = pick("g2", "spread")
    expect(defaultSelection([a, b, c], "parlay", 2)?.map((p) => p.id)).toEqual([a.id, c.id])
  })

  it("returns null when no legal slip exists", () => {
    expect(defaultSelection([pick("g1", "spread"), pick("g1", "total")], "parlay", 2)).toBeNull()
  })

  it("builds a same-game parlay from the first qualifying game", () => {
    const a = pick("g1", "spread")
    const b = pick("g1", "total")
    expect(defaultSelection([a, b], "same-game-parlay", 2)?.map((p) => p.id)).toEqual([a.id, b.id])
  })
})

describe("parlayMath", () => {
  it("multiplies prices and the engine's probabilities", () => {
    const out = parlayMath([
      { decimal: 2.0, fairProbability: 0.5 },
      { decimal: 1.5, fairProbability: 0.6 },
    ])
    expect(out.combinedDecimal).toBe(3)
    expect(out.winProbability).toBe(0.3)
  })
})

describe("americanFromDecimal", () => {
  it("converts favorites and underdogs", () => {
    expect(americanFromDecimal(2.5)).toBe("+150")
    expect(americanFromDecimal(2.0)).toBe("+100")
    expect(americanFromDecimal(1.909)).toBe("-110")
    expect(americanFromDecimal(1)).toBe("—")
  })
})

describe("parlay candidates", () => {
  it("keeps at most two bets per game so twenty candidates span many games", () => {
    const pool = Array.from({ length: 30 }, (_, i) => pick(`g${Math.floor(i / 3)}`, ["spread", "total", "moneyline"][i % 3]))
    const out = eligibleCandidates(pool, "parlay", 3, NOW)
    expect(out).toHaveLength(20)
    expect(new Set(out.map((p) => p.gameId)).size).toBe(10)
  })

  it("counts the upcoming games a pool covers", () => {
    const started = pick("old", "spread", { game: { sport: "NFL", homeTeam: "H", awayTeam: "A", commenceTime: EARLIER } })
    expect(upcomingGameCount([pick("a", "spread"), pick("a", "total"), pick("b", "spread"), started], NOW)).toBe(2)
  })
})

describe("inRiskBand", () => {
  it("sorts bets into favorites, balanced and underdogs by the engine's win chance", () => {
    expect(inRiskBand({ fairProbability: 0.7 }, "low")).toBe(true)
    expect(inRiskBand({ fairProbability: 0.55 }, "low")).toBe(false)
    expect(inRiskBand({ fairProbability: 0.5 }, "medium")).toBe(true)
    expect(inRiskBand({ fairProbability: 0.3 }, "high")).toBe(true)
    expect(inRiskBand({ fairProbability: 0.05 }, "high")).toBe(false)
  })
})

describe("copyProblem", () => {
  it("rejects inducements and claims the model has no data for", () => {
    expect(copyProblem("This is a lock tonight")).toMatch(/lock/)
    expect(copyProblem("Guaranteed winner")).toMatch(/guarantee/)
    expect(copyProblem("Their QB is injured")).toMatch(/injur/)
    expect(copyProblem("Wind and weather favor the under")).toMatch(/weather/)
    expect(copyProblem("They won the last 5 games")).toMatch(/past results/)
  })

  it("accepts plain, numbers-only text", () => {
    expect(copyProblem("The engine rates this 58% likely; the price is 1.2% below fair.")).toBeNull()
    // "block" contains "lock" but is not the word.
    expect(copyProblem("A block of three favorites priced near fair.")).toBeNull()
    // Ranges, prices and spreads are not win-loss records.
    expect(copyProblem("Balanced bets sit in the 40-62% range; Chiefs -3.5 at -110 in a 3-leg parlay.")).toBeNull()
    expect(copyProblem("Gambling problem? Call 1-800-GAMBLER.")).toBeNull()
  })

  it("rejects invented records, results, injuries and weather", () => {
    for (const text of [
      "The Lions are 6-1 this season and have covered in five straight road games.",
      "Detroit owns the best home record in the NFC and has won four in a row.",
      "Their quarterback is questionable with a hamstring issue.",
      "Rain and wind expected in Buffalo favor the under.",
      "They are 7-3 ATS.",
    ]) {
      expect(copyProblem(text), text).not.toBeNull()
    }
  })

  it("rejects calling a below-fair price value", () => {
    for (const text of [
      "This is the best value on the board: a 2% edge for the Chiefs.",
      "An underpriced underdog with real value at +180.",
      "A +EV play at a 3% discount to fair.",
      "The Chiefs look undervalued at +150.",
      "The market undervalues Detroit here.",
      "An under-priced underdog at +180.",
      "This side has the edges on both lines.",
      "Plus-EV at +150.",
      "Positive expected return at this price.",
      "A bargain at +180.",
      "There is a little value on the Browns at +130.",
      "This pick is not without value at +130.",
    ]) {
      expect(copyProblem(text, { belowFair: true }), text).toMatch(/value/)
    }
    // A price that really is better than fair may be called an edge.
    expect(copyProblem("The price is 3.1% better than fair, a small edge.", { belowFair: false })).toBeNull()
    // "values" as a verb is the engine's estimate, not a claim about the price.
    expect(copyProblem("The engine values this leg at 58%, priced slightly below fair.", { belowFair: true })).toBeNull()
  })

  it("rejects denials too, which are easily claims (the prompt forbids the words outright)", () => {
    for (const text of [
      "Detroit has no injury concerns heading into Sunday.",
      "Both teams are at full strength with no injuries reported.",
      "With no lineup changes expected, the Dodgers are a solid play.",
      "No weather concerns at the dome, which suits the over.",
      "No parlay is guaranteed, except this one.",
      "Nothing is a sure thing, but this comes close.",
      "It's not a guarantee, it's a certainty.",
      "There is no risk-free bet, but this one is close.",
      "Nothing is guaranteed, but this one is a lock.",
      "This is a can't-miss leg.",
    ]) {
      expect(copyProblem(text), text).not.toBeNull()
    }
  })

  it("accepts honest engine wording", () => {
    for (const text of [
      "The engine's forecast gives the Chiefs a 62% chance.",
      "The engine rates these 40-62 percent likely.",
      "A 3-leg parlay at these prices wins about 18% of the time.",
      "Over 45.5 at -110 at DraftKings, priced near fair.",
      "The Minnesota Wild and Tampa Bay Lightning meet tonight; the Wild are rated 44% likely.",
    ]) {
      expect(copyProblem(text), text).toBeNull()
    }
  })
})
