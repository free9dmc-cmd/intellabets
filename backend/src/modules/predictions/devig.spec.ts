import { buildConsensus, groupByLine, type BookMarket } from "./devig"
import { PredictionEngineService } from "./prediction-engine.service"

/** One two-way moneyline market as a given book prices it. */
function book(key: string, home: number, away: number): BookMarket {
  return {
    book: key,
    line: {
      id: `${key}-h2h`,
      type: "moneyline",
      name: "Moneyline",
      rawName: "h2h",
      lastUpdated: new Date(),
      outcomes: [
        { id: "home", name: "Home", description: "Home", odds: { decimal: home } as never, isMain: true },
        { id: "away", name: "Away", description: "Away", odds: { decimal: away } as never, isMain: true },
      ],
    },
  } as BookMarket
}

describe("buildConsensus line shopping", () => {
  it("never offers an offshore book, even when it has the best price", () => {
    const [home] = buildConsensus([
      book("bovada", 2.5, 1.6),
      book("fanduel", 2.05, 1.8),
      book("draftkings", 2.1, 1.77),
    ])
    expect(home.bestBook).toBe("draftkings")
    expect(home.bestDecimal).toBe(2.1)
  })

  it("still uses offshore prices in the consensus probability", () => {
    const withOffshore = buildConsensus([book("bovada", 2.5, 1.6), book("fanduel", 2.05, 1.8)])[0]
    const without = buildConsensus([book("fanduel", 2.05, 1.8)])[0]
    expect(withOffshore.fairProbability).not.toBeCloseTo(without.fairProbability, 6)
  })

  it("offers nothing when only non-routable books price the outcome", () => {
    const [home] = buildConsensus([book("bovada", 2.5, 1.6), book("somebook", 2.4, 1.6)])
    expect(home.bestBook).toBe("unknown")
    expect(home.bestDecimal).toBe(0)
  })
})

/** One two-way spread market as a given book prices it, at its own number. */
function spread(key: string, point: number, fav: number, dog: number): BookMarket {
  return {
    book: key,
    line: {
      id: `${key}-spreads`,
      type: "spread",
      name: "spread",
      rawName: "spreads",
      lastUpdated: new Date(),
      outcomes: [
        { id: `g:spreads:Home:${-point}`, name: "Home", description: `Home ${-point}`, odds: { decimal: fav } as never, point: -point, isMain: true },
        { id: `g:spreads:Away:${point}`, name: "Away", description: `Away +${point}`, odds: { decimal: dog } as never, point, isMain: true },
      ],
    },
  } as BookMarket
}

describe("groupByLine", () => {
  it("puts books on the same number together, whatever the order", () => {
    const groups = groupByLine([
      spread("lowvig", 3, 1.95, 1.95),
      spread("fanduel", 3.5, 2.0, 1.83),
      spread("draftkings", 3.5, 1.98, 1.85),
      spread("betmgm", 3.5, 1.95, 1.87),
    ])
    expect(groups.map((g) => g.map((b) => b.book))).toEqual([["lowvig"], ["fanduel", "draftkings", "betmgm"]])
  })

  it("keeps a moneyline in one group", () => {
    expect(groupByLine([book("fanduel", 2, 1.8), book("draftkings", 2.1, 1.77)])).toHaveLength(1)
  })
})

describe("PredictionEngineService line handling", () => {
  const engine = new PredictionEngineService()
  const game = {
    id: "g",
    canonicalId: "g",
    sport: "NFL" as const,
    homeTeam: "Home",
    awayTeam: "Away",
    commenceTime: new Date(Date.now() + 86_400_000),
  }

  it("evaluates every number with enough books, not only the first book's", () => {
    const bets = engine.analyzeGame(
      game,
      new Map([
        [
          "spread",
          [
            spread("lowvig", 3, 1.95, 1.95),
            spread("fanduel", 3.5, 2.0, 1.83),
            spread("draftkings", 3.5, 1.98, 1.85),
            spread("betmgm", 3.5, 1.95, 1.87),
          ],
        ],
      ]),
      { minEdgePercent: -100 }
    )
    // The -3.5 line is priced by three books and is evaluated; -3 has one book and is not.
    expect(bets.map((b) => b.outcomeId).sort()).toEqual(["g:spreads:Away:3.5", "g:spreads:Home:-3.5"])
    expect(bets.every((b) => b.numBooks === 3)).toBe(true)
  })

  it("ignores a line listed with one side only (it would de-vig to a 100% chance)", () => {
    const overOnly = (key: string): BookMarket => {
      const m = spread(key, 3.5, 1.9, 1.9)
      return { ...m, line: { ...m.line, outcomes: m.line.outcomes.slice(0, 1) } }
    }
    const bets = engine.analyzeGame(
      game,
      new Map([["spread", [overOnly("fanduel"), overOnly("draftkings"), overOnly("betmgm")]]]),
      { minEdgePercent: -100 }
    )
    expect(bets).toEqual([])
  })

  it("counts only the books that price that number toward the minimum", () => {
    const bets = engine.analyzeGame(
      game,
      new Map([
        ["spread", [spread("fanduel", 3, 2.0, 1.83), spread("draftkings", 3.5, 1.98, 1.85), spread("betmgm", 3.5, 1.95, 1.87)]],
      ]),
      { minEdgePercent: -100 }
    )
    expect(bets).toEqual([])
  })
})
