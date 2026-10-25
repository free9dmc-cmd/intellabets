import { describe, expect, it } from "vitest"
import type { EnginePrediction } from "./engine"
import {
  americanFromDecimal,
  defaultSelection,
  eligibleCandidates,
  parlayMath,
  slipProblem,
} from "./ai-picks"

const NOW = Date.parse("2026-10-25T12:00:00Z")
const LATER = "2026-10-25T20:00:00Z"
const EARLIER = "2026-10-25T11:00:00Z"

let n = 0
function pick(gameId: string, marketType: string, overrides: Partial<EnginePrediction> = {}): EnginePrediction {
  n += 1
  return {
    id: `p${n}`,
    gameId,
    outcomeId: `${gameId}:${marketType}:${n}`,
    marketType,
    selection: `Pick ${n}`,
    outcomeName: "Team",
    point: null,
    fairProbability: 0.55,
    offeredOdds: 2.0,
    offeredBook: "fanduel",
    edgePercent: 3,
    kellyStake: 0.01,
    confidence: 70,
    reasoning: null,
    game: { id: gameId, sport: "NFL", league: "NFL", homeTeam: "H", awayTeam: "A", commenceTime: LATER },
    lineMovement: null,
    ...overrides,
  }
}

describe("eligibleCandidates", () => {
  it("drops games that have started and repeated outcomes", () => {
    const a = pick("g1", "spread")
    const started = pick("g2", "spread", { game: { ...a.game, id: "g2", commenceTime: EARLIER } })
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
