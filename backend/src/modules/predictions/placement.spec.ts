import { BOOKS, compareBooks, resolveBook } from "./placement"
import type { BookPriceInput } from "./placement"

function prices(entries: [string, BookPriceInput][]) {
  return new Map<string, BookPriceInput>(entries)
}

describe("BOOKS / resolveBook", () => {
  it("keeps the existing keys working", () => {
    for (const k of ["draftkings", "fanduel", "betmgm", "caesars", "pointsbetus", "betrivers"]) {
      expect(BOOKS[k]).toBeDefined()
    }
    expect(resolveBook("caesars").name).toBe("Caesars")
    expect(resolveBook("williamhill_us").name).toBe("Caesars")
    expect(resolveBook("fanduel").marketLabels.total).toBe("Total Points")
  })

  it("gives new registry books generic labels", () => {
    const hr = resolveBook("hardrockbet")
    expect(hr.name).toBe("Hard Rock Bet")
    expect(hr.marketLabels.moneyline).toBe("Moneyline")
    expect(hr.navHint.length).toBeGreaterThan(0)
  })

  it("falls back for unknown and empty keys", () => {
    expect(resolveBook("somebook").name).toBe("somebook")
    expect(resolveBook(null).name).toBe("your sportsbook")
  })
})

describe("compareBooks", () => {
  const base = { selection: "Chiefs -3.5", matchup: "Bills @ Chiefs", stake: 100 }

  it("ranks by payout and sets link, linkKind and tier", () => {
    const r = compareBooks({
      ...base,
      pricesByBook: prices([
        ["fanduel", { decimal: 1.91, link: "https://sportsbook.fanduel.com/addToBetslip?marketId=1.2&selectionId=3" }],
        ["hardrockbet", { decimal: 2.0, outcomeSid: "7633691097706529027" }],
        ["fanatics", { decimal: 1.95 }],
      ]),
    })
    expect(r.options.map((o) => o.book)).toEqual(["hardrockbet", "fanatics", "fanduel"])
    const [hr, fan, fd] = r.options
    expect(hr).toMatchObject({ linkKind: "betslip", linkSource: "template", tier: 1, trafficRank: 4, isBest: true })
    expect(fan).toMatchObject({ link: "https://sportsbook.fanatics.com/", linkKind: "home", linkSource: "fallback" })
    expect(fd).toMatchObject({ linkKind: "betslip", linkSource: "provider", trafficRank: 1, bookKind: "sportsbook" })
  })

  it("breaks payout ties by traffic rank", () => {
    const r = compareBooks({
      ...base,
      pricesByBook: prices([
        ["betrivers", { decimal: 1.95 }],
        ["somebook", { decimal: 1.95 }],
        ["draftkings", { decimal: 1.95 }],
        ["fanduel", { decimal: 1.95 }],
      ]),
    })
    expect(r.options.map((o) => o.book)).toEqual(["fanduel", "draftkings", "betrivers", "somebook"])
    expect(r.best?.book).toBe("fanduel")
    expect(r.options.every((o) => o.lessThanBest === 0)).toBe(true)
  })

  it("still puts the better price first, whatever the traffic", () => {
    const r = compareBooks({
      ...base,
      pricesByBook: prices([
        ["fanduel", { decimal: 1.9 }],
        ["courtside", { decimal: 1.91 }],
      ]),
    })
    expect(r.best?.book).toBe("courtside")
    expect(r.best?.bookKind).toBe("sweepstakes")
  })

  it("drops offshore books entirely", () => {
    const r = compareBooks({
      ...base,
      pricesByBook: prices([
        ["bovada", { decimal: 2.5, link: "https://www.bovada.lv/" }],
        ["BetOnlineAG", { decimal: 2.4 }],
        ["draftkings", { decimal: 1.9 }],
      ]),
    })
    expect(r.options.map((o) => o.book)).toEqual(["draftkings"])
  })

  it("never passes through an unvalidated link for an unknown book", () => {
    const r = compareBooks({
      ...base,
      pricesByBook: prices([["somebook", { decimal: 1.9, link: "javascript:alert(1)" }]]),
    })
    expect(r.options[0]).toMatchObject({ link: null, linkKind: null, tier: null, trafficRank: null })
  })

  it("passes the user's state to state-hosted books", () => {
    const r = compareBooks({
      ...base,
      state: "NJ",
      pricesByBook: prices([
        [
          "betmgm",
          { decimal: 1.9, link: "https://sports.{state}.betmgm.com/en/sports?options=1-2-3&type=Single" },
        ],
      ]),
    })
    expect(r.options[0]).toMatchObject({
      link: "https://sports.nj.betmgm.com/en/sports?options=1-2-3&type=Single",
      linkKind: "betslip",
    })
  })

  it("uses the event link when there is no betslip", () => {
    const r = compareBooks({
      ...base,
      pricesByBook: prices([
        ["fanduel", { decimal: 1.9, eventLink: "https://sportsbook.fanduel.com/football/nfl/bills-%40-chiefs-123" }],
      ]),
    })
    expect(r.options[0]).toMatchObject({ linkKind: "event", linkSource: "provider" })
  })

  it("handles an empty price map", () => {
    const r = compareBooks({ ...base, pricesByBook: prices([]) })
    expect(r.options).toEqual([])
    expect(r.best).toBeNull()
  })
})
