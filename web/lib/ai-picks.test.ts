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
  })
})
