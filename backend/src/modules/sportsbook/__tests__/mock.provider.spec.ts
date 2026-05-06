import { MockProvider } from "../providers/mock.provider"
import type { Market, PropBet, PseudoBetResult } from "../types/provider.types"
import { fromAmerican } from "../utils/odds-normalizer"

describe("MockProvider", () => {
  let provider: MockProvider

  beforeEach(() => {
    provider = new MockProvider()
  })

  // ─── Identity ──────────────────────────────────────────────────────────────

  describe("identity", () => {
    it("has correct name and displayName", () => {
      expect(provider.name).toBe("mock")
      expect(provider.displayName).toContain("Mock")
      expect(provider.supportsLive).toBe(false)
    })
  })

  // ─── listMarkets ──────────────────────────────────────────────────────────

  describe("listMarkets()", () => {
    it("returns an array of markets", async () => {
      const markets = await provider.listMarkets()
      expect(Array.isArray(markets)).toBe(true)
      expect(markets.length).toBeGreaterThan(0)
    })

    it("returns at most the requested limit", async () => {
      const markets = await provider.listMarkets({ limit: 3 })
      expect(markets.length).toBeLessThanOrEqual(3)
    })

    it("filters by sport", async () => {
      const markets = await provider.listMarkets({ sport: "NFL" })
      markets.forEach((m) => expect(m.sport).toBe("NFL"))
    })

    it("each market has required fields", async () => {
      const markets = await provider.listMarkets({ limit: 5 })
      markets.forEach((m) => {
        expect(m.id).toBeTruthy()
        expect(m.canonicalId).toBeTruthy()
        expect(m.sport).toBeTruthy()
        expect(m.homeTeam).toBeTruthy()
        expect(m.awayTeam).toBeTruthy()
        expect(m.commenceTime).toBeInstanceOf(Date)
        expect(m.provider).toBe("mock")
        expect(Array.isArray(m.markets)).toBe(true)
      })
    })

    it("each market includes moneyline, spread, and total lines", async () => {
      const markets = await provider.listMarkets({ limit: 1 })
      const m = markets[0]
      const types = m.markets.map((l) => l.type)
      expect(types).toContain("moneyline")
      expect(types).toContain("spread")
      expect(types).toContain("total")
    })

    it("all outcomes have valid normalised odds", async () => {
      const markets = await provider.listMarkets({ limit: 3 })
      markets.forEach((m) => {
        m.markets.forEach((line) => {
          line.outcomes.forEach((o) => {
            expect(o.odds.decimal).toBeGreaterThan(1)
            expect(o.odds.impliedProbability).toBeGreaterThan(0)
            expect(o.odds.impliedProbability).toBeLessThan(1)
            expect(typeof o.odds.american).toBe("number")
            expect(typeof o.odds.fractional).toBe("string")
          })
        })
      })
    })
  })

  // ─── getOdds ──────────────────────────────────────────────────────────────

  describe("getOdds()", () => {
    it("returns a market for a valid game ID", async () => {
      const markets = await provider.listMarkets({ limit: 1 })
      const gameId = markets[0].id
      const market = await provider.getOdds(gameId)
      expect(market.id).toBe(gameId)
    })

    it("falls back to first fixture for unknown game ID", async () => {
      const market = await provider.getOdds("unknown:game:id")
      expect(market).toBeDefined()
      expect(market.provider).toBe("mock")
    })

    it("spread outcomes have point values", async () => {
      const markets = await provider.listMarkets({ limit: 1 })
      const market = await provider.getOdds(markets[0].id)
      const spread = market.markets.find((l) => l.type === "spread")
      expect(spread).toBeDefined()
      spread!.outcomes.forEach((o) => {
        expect(o.point).not.toBeUndefined()
      })
    })

    it("spread home + away points are mirror values", async () => {
      const markets = await provider.listMarkets({ limit: 1 })
      const market = await provider.getOdds(markets[0].id)
      const spread = market.markets.find((l) => l.type === "spread")!
      const home = spread.outcomes[0].point!
      const away = spread.outcomes[1].point!
      expect(home + away).toBe(0)
    })
  })

  // ─── getProps ─────────────────────────────────────────────────────────────

  describe("getProps()", () => {
    it("returns an array of props", async () => {
      const props = await provider.getProps("any-game-id")
      expect(Array.isArray(props)).toBe(true)
      expect(props.length).toBeGreaterThan(0)
    })

    it("each prop has over and under outcomes", async () => {
      const props = await provider.getProps("any-game-id")
      props.forEach((p: PropBet) => {
        expect(p.outcomes.length).toBe(2)
        const names = p.outcomes.map((o) => o.name)
        expect(names).toContain("Over")
        expect(names).toContain("Under")
      })
    })

    it("filters by category", async () => {
      const props = await provider.getProps("any-game-id", { category: "passing" })
      props.forEach((p) => expect(p.category).toBe("passing"))
    })

    it("each prop has a positive line value", async () => {
      const props = await provider.getProps("any-game-id")
      props.forEach((p) => expect(p.line).toBeGreaterThan(0))
    })
  })

  // ─── placePseudoBet ───────────────────────────────────────────────────────

  describe("placePseudoBet()", () => {
    const sampleRequest = {
      userId: "user-123",
      gameId: "mock:nfl:chiefs:raiders",
      marketType: "moneyline" as const,
      outcomeId: "mock:nfl:chiefs:raiders:ml:home",
      stake: 100,
      odds: fromAmerican(-110),
    }

    it("returns a successful result", async () => {
      const result: PseudoBetResult = await provider.placePseudoBet(sampleRequest)
      expect(result.success).toBe(true)
    })

    it("returns a unique betId", async () => {
      const [a, b] = await Promise.all([
        provider.placePseudoBet(sampleRequest),
        provider.placePseudoBet(sampleRequest),
      ])
      expect(a.betId).not.toBe(b.betId)
    })

    it("calculates correct potentialReturn", async () => {
      const result = await provider.placePseudoBet(sampleRequest)
      const expected = parseFloat((sampleRequest.stake * sampleRequest.odds.decimal).toFixed(2))
      expect(result.potentialReturn).toBeCloseTo(expected, 1)
    })

    it("estimatedSettlement is in the future", async () => {
      const result = await provider.placePseudoBet(sampleRequest)
      expect(result.estimatedSettlement.getTime()).toBeGreaterThan(Date.now())
    })

    it("reference starts with MOCK-", async () => {
      const result = await provider.placePseudoBet(sampleRequest)
      expect(result.reference).toMatch(/^MOCK-/)
    })
  })

  // ─── healthCheck ──────────────────────────────────────────────────────────

  describe("healthCheck()", () => {
    it("always returns healthy for mock provider", async () => {
      const health = await provider.healthCheck()
      expect(health.healthy).toBe(true)
      expect(health.provider).toBe("mock")
      expect(health.checkedAt).toBeInstanceOf(Date)
      expect(health.latencyMs).toBeGreaterThanOrEqual(0)
    })
  })
})
