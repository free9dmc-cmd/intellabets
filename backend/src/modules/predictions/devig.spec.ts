import { buildConsensus, type BookMarket } from "./devig"

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
