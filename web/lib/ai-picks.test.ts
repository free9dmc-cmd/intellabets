import { describe, expect, it } from "vitest"
import {
  BET_TYPES,
  LEG_COUNT,
  RISK_LEVELS,
  americanFromDecimal,
  copyProblem,
  defaultSelection,
  eligibleCandidates,
  inRiskBand,
  isPropSport,
  isSlipKind,
  isTrackable,
  legCount,
  parlayMath,
  riskBandBounds,
  slipProblem,
  untrackablePropMessage,
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

// ---------------------------------------------------------------------------
// Player props

const STAT_LABEL: Record<string, string> = { player_points: "Points", player_assists: "Assists", player_rebounds: "Rebounds" }

/** A props board bet, shaped as the engine sends it: marketType "prop", the player-stat key apart. */
function prop(
  gameId: string,
  player: string,
  statKey: string,
  side: "Over" | "Under",
  point: number,
  overrides: Partial<SlipCandidate> = {}
): SlipCandidate {
  const stat = STAT_LABEL[statKey]
  return pick(gameId, "prop", {
    outcomeId: `ev-${gameId}:${statKey}:${player}:${side}:${point}`,
    marketKey: `${statKey}|${player}`,
    player,
    stat,
    selection: `${player} ${side} ${point} ${stat}`,
    fairProbability: 0.5,
    game: { sport: "NBA", homeTeam: "Orlando Magic", awayTeam: "Boston Celtics", commenceTime: LATER },
    ...overrides,
  })
}

describe("player-prop same-game parlays", () => {
  it("rejects both sides of one player's stat", () => {
    const over = prop("g1", "Jayson Tatum", "player_points", "Over", 27.5)
    const under = prop("g1", "Jayson Tatum", "player_points", "Under", 27.5)
    expect(slipProblem([over, under], "same-game-parlay", 2)).toBe("puts the same player and stat in a same-game parlay twice")
  })

  it("rejects two numbers on one player's stat", () => {
    const a = prop("g1", "Jayson Tatum", "player_assists", "Over", 6.5)
    const b = prop("g1", "Jayson Tatum", "player_assists", "Over", 7.5)
    expect(slipProblem([a, b], "same-game-parlay", 2)).toMatch(/same player and stat/)
  })

  it("accepts different players, or different stats for one player", () => {
    const tatum = prop("g1", "Jayson Tatum", "player_points", "Over", 27.5)
    const banchero = prop("g1", "Paolo Banchero", "player_points", "Over", 24.5)
    const tatumReb = prop("g1", "Jayson Tatum", "player_rebounds", "Under", 8.5)
    expect(slipProblem([tatum, banchero], "same-game-parlay", 2)).toBeNull()
    expect(slipProblem([tatum, banchero, tatumReb], "same-game-parlay", 3)).toBeNull()
  })

  it("still keeps a same-game parlay to one game", () => {
    const a = prop("g1", "Jayson Tatum", "player_points", "Over", 27.5)
    const b = prop("g2", "Paolo Banchero", "player_points", "Over", 24.5)
    expect(slipProblem([a, b], "same-game-parlay", 2)).toMatch(/mixes games/)
  })

  it("finds candidates with one leg per player and stat, and the engine's default slip", () => {
    const tatumOver = prop("g1", "Jayson Tatum", "player_points", "Over", 27.5)
    const tatumUnder = prop("g1", "Jayson Tatum", "player_points", "Under", 27.5)
    const tatumHigher = prop("g1", "Jayson Tatum", "player_points", "Over", 28.5)
    const banchero = prop("g1", "Paolo Banchero", "player_points", "Over", 24.5)
    const tatumReb = prop("g1", "Jayson Tatum", "player_rebounds", "Under", 8.5)
    const pool = [tatumOver, tatumUnder, tatumHigher, banchero, tatumReb]
    const out = eligibleCandidates(pool, "same-game-parlay", 3, NOW)
    expect(out.map((p) => p.id)).toEqual([tatumOver.id, banchero.id, tatumReb.id])
    const chosen = defaultSelection(out, "same-game-parlay", 3)
    expect(chosen?.map((p) => p.id)).toEqual([tatumOver.id, banchero.id, tatumReb.id])
  })

  it("needs the player-stat key: without it every prop is one market", () => {
    // Every prop's marketType is "prop", so it cannot tell players apart.
    const a = prop("g1", "Jayson Tatum", "player_points", "Over", 27.5, { marketKey: null })
    const b = prop("g1", "Paolo Banchero", "player_points", "Over", 24.5, { marketKey: null })
    expect(eligibleCandidates([a, b], "same-game-parlay", 2, NOW)).toEqual([])
  })

  it("applies the regular-parlay rules to props unchanged", () => {
    const a = prop("g1", "Jayson Tatum", "player_points", "Over", 27.5)
    const b = prop("g1", "Paolo Banchero", "player_points", "Over", 24.5)
    const c = prop("g2", "LeBron James", "player_points", "Under", 24.5)
    expect(slipProblem([a, b], "parlay", 2)).toMatch(/one game/)
    expect(slipProblem([a, c], "parlay", 2)).toBeNull()
  })
})

describe("legCount", () => {
  it("uses the game-line table for lines", () => {
    for (const risk of RISK_LEVELS) {
      for (const bt of BET_TYPES) expect(legCount("lines", risk, bt)).toBe(LEG_COUNT[risk][bt])
    }
  })

  it("uses the props table for props", () => {
    const table = Object.fromEntries(RISK_LEVELS.map((r) => [r, BET_TYPES.map((bt) => legCount("props", r, bt))]))
    // [single, parlay, same-game-parlay]
    expect(table).toEqual({ low: [1, 2, 2], medium: [1, 3, 3], high: [1, 4, 2] })
  })
})

describe("riskBandBounds", () => {
  it("gives each risk level's win-chance band", () => {
    expect(riskBandBounds("low")).toEqual({ minProb: 0.6, maxProb: 1 })
    expect(riskBandBounds("medium")).toEqual({ minProb: 0.4, maxProb: 0.62 })
    expect(riskBandBounds("high")).toEqual({ minProb: 0.15, maxProb: 0.4 })
  })

  it("never drops a bet inRiskBand would keep", () => {
    for (const risk of RISK_LEVELS) {
      const { minProb, maxProb } = riskBandBounds(risk)
      for (let i = 0; i <= 100; i++) {
        const p = i / 100
        if (inRiskBand({ fairProbability: p }, risk)) expect(p >= minProb && p <= maxProb, `${risk} ${p}`).toBe(true)
      }
    }
  })
})

describe("slip kinds and prop sports", () => {
  it("accepts only lines and props", () => {
    expect(isSlipKind("lines")).toBe(true)
    expect(isSlipKind("props")).toBe(true)
    expect(isSlipKind("Props")).toBe(false)
    expect(isSlipKind(undefined)).toBe(false)
  })

  it("offers props for NBA, NFL and NHL", () => {
    expect(["NBA", "NFL", "NHL"].every(isPropSport)).toBe(true)
    expect(isPropSport("MLB")).toBe(false)
    expect(isPropSport("NCAAF")).toBe(false)
  })
})

describe("isTrackable", () => {
  it("tracks singles, and props only where the engine grades them", () => {
    expect(isTrackable({ marketType: "prop", sport: "NBA" }, 1)).toBe(false)
    expect(isTrackable({ marketType: "prop", sport: "NFL" }, 1)).toBe(false)
    // NHL is added once its grader is verified on a real slate.
    expect(isTrackable({ marketType: "prop", sport: "NHL" }, 1)).toBe(false)
    expect(isTrackable({ marketType: "prop", sport: "MLB" }, 1)).toBe(true)
    expect(isTrackable({ marketType: "moneyline", sport: "NBA" }, 1)).toBe(true)
    expect(isTrackable({ marketType: "moneyline", sport: "NBA" }, 2)).toBe(false)
    expect(isTrackable({ marketType: "prop", sport: "MLB" }, 2)).toBe(false)
  })

  it("says why a prop cannot be tracked", () => {
    expect(untrackablePropMessage("NBA")).toBe("We can't grade NBA player props yet, so this bet can't be tracked here.")
  })
})

describe("copyProblem for player props", () => {
  // Claims the model has no data for: it gets selections, prices and win chances only.
  const invented = [
    "Jayson Tatum is averaging 27 points, so the over looks reasonable.",
    "He has gone over this line in 7 of his last 10.",
    "Tatum has hit the over in most matchups.",
    "Svechnikov leads the team in shots on goal.",
    "His usage rate jumps with Brown out tonight.",
    "Orlando allows the most points to forwards.",
    "Dak Prescott threw for 300 yards last week.",
    "A career-high pace makes this attractive.",
    "He's been hot lately.",
    "His minutes have increased.",
    // Found by the review: other wordings of the same claims.
    "Seven of his last ten games went over this number.",
    "Over in 4 of the past 5 games.",
    "He\u2019s cleared this number often.",
    "Tatum gets more shots with Jaylen Brown out.",
    "He is in great form.",
    "He is on fire.",
    "Tatum is a 27 PPG scorer.",
    "He is the top scorer.",
    "It's a revenge game for him against his former team.",
    "Tatum's minutes are up.",
    "He dropped 35 on Tuesday.",
    "He has been putting up 27 a night.",
    "He is shooting 45% from three.",
    "Orlando's offense runs through Banchero.",
  ]
  const legitimate = [
    "LeBron James Over 24.5 Points is priced near fair at -110.",
    "Over 2.5 3-Pointers at +120 is slightly below fair.",
    "Sebastian Aho Over 0.5 Points: the engine rates it 64% likely.",
    "Dak Prescott Under 275.5 Passing Yards pays -115 at DraftKings, 2.1% below fair.",
    "CeeDee Lamb Over 5.5 Receptions is the most likely leg on this slip at 58%.",
    "Andrei Svechnikov Over 2.5 Shots on Goal is priced close to fair.",
    "Two player props from the same game; the book prices the parlay itself.",
    "Payout is about $26 on a $10 stake.",
    // Found by the review: honest risk wording that must not be rejected.
    "This parlay carries more risk because every leg must win.",
    "Each leg carries the sportsbook's usual margin.",
    "This slip targets the best-priced Balanced props.",
    "Both legs have been chosen from the same game.",
    "The price has been set slightly below fair.",
    "A same-game parlay allows the book to price the combination itself.",
    "These are the most recent prices in the feed.",
    "Two props from the Celtics-Magic matchup.",
    "Both legs must win, so the combined chance is about 26%.",
  ]

  it("rejects invented player stats and news", () => {
    for (const text of invented) expect(copyProblem(text, { props: true }), text).toBe("mentions player stats or news")
  })

  it("accepts selections, prices, win chances and payouts", () => {
    for (const text of legitimate) {
      expect(copyProblem(text, { props: true }), text).toBeNull()
      expect(copyProblem(text, { props: true, belowFair: true }), text).toBeNull()
    }
  })

  it("rejects injury and availability news for any slip", () => {
    for (const text of [
      "Jaylen Brown won't play tonight.",
      "Brown will miss tonight's game.",
      "Brown is day-to-day.",
      "He is a game-time decision.",
      "It is the second night of a back-to-back.",
      "Brown is listed as probable.",
    ]) {
      expect(copyProblem(text), text).toBe("mentions injuries")
    }
    expect(copyProblem("The favorite is the more probable leg at 64%.")).toBeNull()
  })

  it("does not read the slip's own names as banned words", () => {
    const text = "Drew Lock Over 199.5 Passing Yards is priced near fair."
    expect(copyProblem(text, { props: true })).toMatch(/lock/)
    expect(copyProblem(text, { props: true, names: ["Drew Lock Over 199.5 Passing Yards", "Drew Lock"] })).toBeNull()
  })

  it("keeps every other check for props", () => {
    expect(copyProblem("Tatum Over 27.5 Points is a lock.", { props: true })).toMatch(/lock/)
    expect(copyProblem("He is questionable with an ankle issue.", { props: true })).toMatch(/injur/)
    expect(copyProblem("Real value on Tatum at +105.", { props: true, belowFair: true })).toMatch(/value/)
  })

  it("leaves game-line copy as it was when props is not set", () => {
    const text = "The Wild's opponent is Tampa Bay; the engine rates the Wild 44% likely."
    expect(copyProblem(text)).toBeNull()
    expect(copyProblem(text, { belowFair: true })).toBeNull()
    expect(copyProblem(text, { props: true })).toBe("mentions player stats or news")
  })
})
