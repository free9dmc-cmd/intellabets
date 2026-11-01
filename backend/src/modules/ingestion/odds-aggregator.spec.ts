import { readFileSync } from "fs"
import { join } from "path"
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios"
import type { ConfigService } from "@nestjs/config"
import { OddsAggregatorService, OddsApiError } from "./odds-aggregator.service"
import { groupByLine } from "../predictions/devig"

type Adapter = (config: InternalAxiosRequestConfig) => Promise<unknown>

function service(adapter: Adapter, env: Record<string, string> = {}) {
  const values: Record<string, string> = { THE_ODDS_API_KEY: "test-key-0123456789", ...env }
  const config = { get: (k: string, d?: unknown) => (k in values ? values[k] : d) }
  const svc = new OddsAggregatorService(config as unknown as ConfigService)
  ;(svc as unknown as { http: { defaults: { adapter: unknown } } }).http.defaults.adapter = adapter
  return svc
}

/** A 200 response carrying `data` and The Odds API's credit headers. */
function ok(config: InternalAxiosRequestConfig, data: unknown, headers: Record<string, string> = {}) {
  return { status: 200, statusText: "OK", data, headers: new AxiosHeaders(headers), config }
}

/** An Odds API event-odds response for player props, from __fixtures__ (american odds). */
interface PropsFixture {
  id: string
  sport_key: string
  bookmakers: {
    key: string
    markets: { key: string; outcomes: { name: string; description?: string; price: number; point?: number }[] }[]
  }[]
}
function fixture(name: "nba" | "nfl" | "nhl"): PropsFixture {
  return JSON.parse(readFileSync(join(__dirname, "__fixtures__", `props-${name}.json`), "utf8"))
}

describe("OddsAggregatorService errors", () => {
  it("reports The Odds API's error code and the credits left, not just the status", async () => {
    const svc = service(async (config) => {
      const response = {
        status: 401,
        statusText: "Unauthorized",
        data: { message: "Usage quota has been reached.", error_code: "OUT_OF_USAGE_CREDITS" },
        headers: new AxiosHeaders({ "x-requests-remaining": "0", "x-requests-used": "20000" }),
        config,
      }
      throw new AxiosError("Request failed with status code 401", "ERR_BAD_REQUEST", config, null, response)
    })

    const err = await svc.fetchSlate("americanfootball_nfl").catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OddsApiError)
    expect((err as OddsApiError).status).toBe(401)
    expect((err as OddsApiError).code).toBe("OUT_OF_USAGE_CREDITS")
    expect((err as OddsApiError).isAuthFailure).toBe(true)
    expect((err as Error).message).toContain("Usage quota has been reached.")
    // The API key is sent as a query param; it must never appear in the error.
    expect((err as Error).message).not.toContain("test-key-0123456789")

    const status = svc.status()
    expect(status.lastError).toMatchObject({ status: 401, code: "OUT_OF_USAGE_CREDITS" })
    expect(status.quota).toMatchObject({ remaining: 0, used: 20000 })
    expect(status.lastSuccessAt).toBeNull()
  })

  it("records the quota on success", async () => {
    const svc = service(async (config) => ({
      status: 200,
      statusText: "OK",
      data: [],
      headers: new AxiosHeaders({ "x-requests-remaining": "19500", "x-requests-used": "500", "x-requests-last": "3" }),
      config,
    }))
    await expect(svc.fetchSlate("americanfootball_nfl")).resolves.toEqual([])
    expect(svc.status().quota).toMatchObject({ remaining: 19500, used: 500, lastCost: 3 })
    expect(svc.status().lastSuccessAt).not.toBeNull()
  })

  it("does not treat a server error as an auth failure", async () => {
    const svc = service(async (config) => {
      const response = { status: 500, statusText: "Error", data: {}, headers: new AxiosHeaders(), config }
      throw new AxiosError("Request failed with status code 500", "ERR_BAD_RESPONSE", config, null, response)
    })
    const err = (await svc.fetchSlate("basketball_nba").catch((e: unknown) => e)) as OddsApiError
    expect(err.isAuthFailure).toBe(false)
  })
})

describe("OddsAggregatorService outcome descriptions", () => {
  it("signs a spread but not a total", async () => {
    const market = (key: string, outcomes: { name: string; price: number; point: number }[]) => ({
      key,
      last_update: "2026-10-28T12:00:00Z",
      outcomes,
    })
    const svc = service(async (config) => ({
      status: 200,
      statusText: "OK",
      data: [
        {
          id: "evt",
          sport_key: "americanfootball_nfl",
          commence_time: "2026-10-29T17:00:00Z",
          home_team: "Kansas City Chiefs",
          away_team: "Las Vegas Raiders",
          bookmakers: [
            {
              key: "fanduel",
              title: "FanDuel",
              markets: [
                market("spreads", [
                  { name: "Kansas City Chiefs", price: -110, point: -6.5 },
                  { name: "Las Vegas Raiders", price: -110, point: 6.5 },
                ]),
                market("totals", [
                  { name: "Over", price: -110, point: 45.5 },
                  { name: "Under", price: -110, point: 45.5 },
                ]),
              ],
            },
          ],
        },
      ],
      headers: new AxiosHeaders(),
      config,
    }))
    const [game] = await svc.fetchSlate("americanfootball_nfl")
    const describe = (type: string) => game.booksByMarket.get(type)![0].line.outcomes.map((o) => o.description)
    expect(describe("spread")).toEqual(["Kansas City Chiefs -6.5", "Las Vegas Raiders +6.5"])
    expect(describe("total")).toEqual(["Over 45.5", "Under 45.5"])
  })
})

describe("OddsAggregatorService player props", () => {
  const SPORT = { nba: "basketball_nba", nfl: "americanfootball_nfl", nhl: "icehockey_nhl" } as const

  async function props(name: keyof typeof SPORT, data: unknown = fixture(name)) {
    const svc = service(async (config) => ok(config, data, { "x-requests-last": "4", "x-requests-remaining": "19748" }))
    const res = await svc.fetchEventProps(SPORT[name], (data as PropsFixture).id)
    return res.books!
  }

  it("keys each player's stat as '<market>|<player>' with book-free outcome ids", async () => {
    const nba = fixture("nba")
    const books = await props("nba")
    const tatum = books.booksByMarket.get("player_assists|Jayson Tatum")!
    const dk = tatum.find((b) => b.book === "draftkings")!
    expect(dk.line.id).toBe(`${nba.id}:draftkings:player_assists:Jayson Tatum`)
    expect(dk.line.type).toBe("prop")
    expect(dk.line.name).toBe("player_assists|Jayson Tatum")
    expect(dk.line.rawName).toBe("player_assists")
    expect(dk.line.outcomes.map((o) => o.id)).toEqual([
      `${nba.id}:player_assists:Jayson Tatum:Over:6.5`,
      `${nba.id}:player_assists:Jayson Tatum:Under:6.5`,
    ])
    expect(dk.line.outcomes.map((o) => o.description)).toEqual([
      "Jayson Tatum Over 6.5 Assists",
      "Jayson Tatum Under 6.5 Assists",
    ])
    // Prices arrive american (-127) and are stored decimal.
    expect(dk.line.outcomes[0].odds.decimal).toBeCloseTo(1 + 100 / 127, 3)
    expect(dk.line.outcomes[0].link).toMatch(/^https:\/\/sportsbook\.draftkings\.com\//)
    // The id is the same at every book, so one board ref names the bet everywhere.
    const fd = tatum.find((b) => b.book === "fanduel")!
    expect(fd.line.outcomes.map((o) => o.id)).toEqual(dk.line.outcomes.map((o) => o.id))
  })

  it.each(["nba", "nfl", "nhl"] as const)("makes every %s line exactly one Over and one Under at one number", async (name) => {
    const books = await props(name)
    expect(books.booksByMarket.size).toBeGreaterThan(0)
    for (const [key, bms] of books.booksByMarket) {
      expect(key).toMatch(/^player_[a-z_]+\|[^|:~,]+$/)
      const perBook = new Set<string>()
      for (const { book, line } of bms) {
        expect(line.outcomes.map((o) => o.name)).toEqual(["Over", "Under"])
        expect(line.outcomes[0].point).toBe(line.outcomes[1].point)
        expect(Number.isFinite(line.outcomes[0].point)).toBe(true)
        // A book appears once per number.
        const slot = `${book}@${line.outcomes[0].point}`
        expect(perBook.has(slot)).toBe(false)
        perBook.add(slot)
      }
    }
  })

  it("splits Bovada's ladder into one two-way line per number, so its main number joins the other books", async () => {
    const raw = fixture("nba")
    const ladder = raw.bookmakers
      .find((b) => b.key === "bovada")!
      .markets.find((m) => m.key === "player_assists")!
      .outcomes.filter((o) => o.description === "Jayson Tatum")
    expect(ladder).toHaveLength(6) // 5.5, 6.5 and 7.5, each Over and Under

    const books = await props("nba")
    const tatum = books.booksByMarket.get("player_assists|Jayson Tatum")!
    const bovada = tatum.filter((b) => b.book === "bovada")
    expect(bovada.map((b) => b.line.outcomes[0].point)).toEqual([5.5, 6.5, 7.5])

    const atMain = groupByLine(tatum).find((g) => g[0].line.outcomes[0].point === 6.5)!
    expect(atMain.map((b) => b.book).sort()).toEqual(
      ["betmgm", "betonlineag", "betrivers", "bovada", "draftkings", "fanatics", "fanduel", "williamhill_us"]
    )
  })

  it("skips player names that would break an outcome id or a board ref", async () => {
    const data = fixture("nhl")
    const rename = (from: string, to: string) => {
      for (const b of data.bookmakers)
        for (const m of b.markets) for (const o of m.outcomes) if (o.description === from) o.description = to
    }
    rename("Andrei Svechnikov", "Svechnikov, Andrei")
    rename("Jackson Blake", "Jackson:Blake")
    rename("Nikolaj Ehlers", "Nikolaj~Ehlers")
    const books = await props("nhl", data)
    const players = Array.from(books.booksByMarket.keys()).map((k) => k.split("|")[1])
    expect(players.length).toBeGreaterThan(0)
    for (const p of players) expect(p).not.toMatch(/[:~,|]/)
    expect(players.some((p) => p.includes("Svechnikov") || p.includes("Blake") || p.includes("Ehlers"))).toBe(false)
  })

  it("keeps one line per book, player and number, and drops one-sided or doubled sides", async () => {
    const market = (outcomes: { name: string; description: string; price: number; point?: number }[]) => ({
      key: "player_points",
      last_update: "2026-11-01T12:00:00Z",
      outcomes,
    })
    const pair = (player: string, point: number) => [
      { name: "Over", description: player, price: -110, point },
      { name: "Under", description: player, price: -110, point },
    ]
    const data = {
      id: "evt",
      sport_key: "basketball_nba",
      sport_title: "NBA",
      commence_time: "2026-11-01T23:00:00Z",
      home_team: "Orlando Magic",
      away_team: "Boston Celtics",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            market([
              ...pair("Paired Player", 20.5),
              { name: "Over", description: "One Side", price: -110, point: 10.5 },
              ...pair("Two Overs", 8.5),
              { name: "Over", description: "Two Overs", price: 120, point: 8.5 },
              { name: "over", description: "Lower Case", price: -110, point: 4.5 },
              { name: "under", description: "Lower Case", price: -110, point: 4.5 },
              { name: "Over", description: "No Number", price: -110 },
              { name: "Under", description: "No Number", price: -110 },
            ]),
            // The same market posted twice must not count the book twice.
            market(pair("Paired Player", 20.5)),
          ],
        },
      ],
    }
    const books = await props("nba", data)
    expect(Array.from(books.booksByMarket.keys()).sort()).toEqual(["player_points|Lower Case", "player_points|Paired Player"])
    expect(books.booksByMarket.get("player_points|Paired Player")).toHaveLength(1)
    // Side names are normalised, so the outcome id always reads Over/Under.
    expect(books.booksByMarket.get("player_points|Lower Case")![0].line.outcomes.map((o) => o.id)).toEqual([
      "evt:player_points:Lower Case:Over:4.5",
      "evt:player_points:Lower Case:Under:4.5",
    ])
  })

  it("reads each call's cost and credits left from that response's own headers", async () => {
    const nhl = fixture("nhl")
    const svc = service(async (config) =>
      config.url?.endsWith("/events")
        ? ok(config, [{ id: nhl.id, home_team: "Carolina Hurricanes", away_team: "Winnipeg Jets", commence_time: "2026-11-01T18:10:00Z" }], {
            "x-requests-last": "0",
            "x-requests-remaining": "19752",
          })
        : ok(config, nhl, { "x-requests-last": "2", "x-requests-remaining": "19750" })
    )
    const listing = await svc.fetchEvents("icehockey_nhl")
    expect(listing).toMatchObject({ cost: 0, remaining: 19752 })
    expect(listing.events).toEqual([
      { id: nhl.id, homeTeam: "Carolina Hurricanes", awayTeam: "Winnipeg Jets", commenceTime: new Date("2026-11-01T18:10:00Z") },
    ])
    const res = await svc.fetchEventProps("icehockey_nhl", nhl.id)
    expect(res).toMatchObject({ cost: 2, remaining: 19750 })
    expect(res.books!.booksByMarket.size).toBeGreaterThan(0)
  })

  it("reports an unknown cost as null, not 0", async () => {
    const svc = service(async (config) => ok(config, fixture("nhl")))
    const res = await svc.fetchEventProps("icehockey_nhl", "evt")
    expect(res.cost).toBeNull()
    expect(res.remaining).toBeNull()
  })

  it("requests props in PROPS_REGIONS, not ODDS_REGIONS", async () => {
    const seen: unknown[] = []
    const adapter: Adapter = async (config) => {
      seen.push(config.params?.regions)
      return ok(config, fixture("nhl"))
    }
    await service(adapter, { ODDS_REGIONS: "us,us2" }).fetchEventProps("icehockey_nhl", "evt")
    await service(adapter, { ODDS_REGIONS: "us", PROPS_REGIONS: " US2, bogus,us2 " }).fetchEventProps("icehockey_nhl", "evt")
    await service(adapter, { PROPS_REGIONS: "eu" }).fetchEventProps("icehockey_nhl", "evt")
    expect(seen).toEqual(["us", "us2", "us"])
  })

  it("throws The Odds API's failure instead of returning nothing", async () => {
    const svc = service(async (config) => {
      const response = {
        status: 401,
        statusText: "Unauthorized",
        data: { message: "Usage quota has been reached.", error_code: "OUT_OF_USAGE_CREDITS" },
        headers: new AxiosHeaders({ "x-requests-remaining": "0" }),
        config,
      }
      throw new AxiosError("Request failed with status code 401", "ERR_BAD_REQUEST", config, null, response)
    })
    const err = await svc.fetchEventProps("basketball_nba", "evt").catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OddsApiError)
    expect((err as OddsApiError).isAuthFailure).toBe(true)
  })

  it("requests nothing for a sport without prop markets", async () => {
    const adapter = jest.fn<Promise<unknown>, [InternalAxiosRequestConfig]>()
    const res = await service(adapter).fetchEventProps("soccer_epl", "evt")
    expect(res).toEqual({ books: null, cost: 0, remaining: null })
    expect(adapter).not.toHaveBeenCalled()
  })
})

describe("OddsAggregatorService configuration", () => {
  const baseURLs = async (env: Record<string, string>) => {
    let baseURL: string | undefined
    await service(async (config) => {
      baseURL = config.baseURL
      return ok(config, [])
    }, env).fetchSlate("basketball_nba")
    return baseURL
  }

  it("honours ODDS_API_BASE_URL outside production only", async () => {
    const fake = "http://127.0.0.1:4010/v4"
    expect(await baseURLs({})).toBe("https://api.the-odds-api.com/v4")
    expect(await baseURLs({ ODDS_API_BASE_URL: fake, NODE_ENV: "development" })).toBe(fake)
    expect(await baseURLs({ ODDS_API_BASE_URL: fake })).toBe(fake)
    expect(await baseURLs({ ODDS_API_BASE_URL: fake, NODE_ENV: "production" })).toBe("https://api.the-odds-api.com/v4")
  })

  it("schedules props only for sports with prop markets that are also active", () => {
    const svc = service(async (config) => ok(config, []), {
      ACTIVE_SPORTS: "basketball_nba,icehockey_nhl,soccer_epl,americanfootball_nfl",
      PROPS_SPORTS: " basketball_nba, icehockey_nhl,soccer_epl,baseball_mlb,basketball_nba,,not_a_sport,americanfootball_nfl",
    })
    expect(svc.propsSportKeys()).toEqual(["basketball_nba", "icehockey_nhl", "americanfootball_nfl"])
    expect(service(async (config) => ok(config, [])).propsSportKeys()).toEqual([])
  })
})
