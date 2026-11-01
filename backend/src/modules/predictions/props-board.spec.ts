import * as fs from "fs"
import * as path from "path"
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios"
import { Logger } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"
import { Prisma } from "@prisma/client"
import { OddsAggregatorService, OddsApiError, type GameBooks } from "../ingestion/odds-aggregator.service"
import { PROP_LABELS, parsePropOutcomeId } from "../ingestion/prop-markets"
import { PredictionEngineService } from "./prediction-engine.service"
import { PredictionsService, type BoardCandidate } from "./predictions.service"
import { PredictionsController } from "./predictions.controller"
import { isRoutableBook } from "./deeplinks"
import { boardSideKey, inProbBand, isBoardKind, propFields, propsFrom, propsMaxPriceAgeMs } from "./board-helpers"

// The props board, prop refs and the admin props call, run on the real
// samples (ingestion/__fixtures__, American odds as production requests them)
// through the production transform, the engine and an in-memory database.

Logger.overrideLogger(false)

const FIXTURES = path.join(__dirname, "../ingestion/__fixtures__")
const SPORT_KEYS = { nba: "basketball_nba", nfl: "americanfootball_nfl", nhl: "icehockey_nhl" } as const
type Sample = keyof typeof SPORT_KEYS
const HOUR = 3_600_000

/** One sample event's raw Odds API response, moved to start at `commence`. */
function sample(name: Sample, commence: Date) {
  const raw = JSON.parse(fs.readFileSync(path.join(FIXTURES, `props-${name}.json`), "utf8")) as { id: string; sport_key: string }
  return { ...raw, commence_time: commence.toISOString().replace(/\.\d{3}Z$/, "Z") }
}

type Route = (url: string) => { data: unknown; headers?: Record<string, string> } | { status: number; data?: unknown }

/** The real aggregator, with The Odds API replaced by `route`. */
function aggregator(route: Route) {
  const config = { get: (k: string, d?: unknown) => (k === "THE_ODDS_API_KEY" ? "test-key-0123456789" : d) }
  const svc = new OddsAggregatorService(config as unknown as ConfigService)
  const calls: string[] = []
  ;(svc as unknown as { http: { defaults: { adapter: unknown } } }).http.defaults.adapter = async (
    cfg: InternalAxiosRequestConfig
  ) => {
    calls.push(cfg.url ?? "")
    const res = route(cfg.url ?? "")
    if ("status" in res) {
      const response = { status: res.status, statusText: "Error", data: res.data ?? {}, headers: new AxiosHeaders(), config: cfg }
      throw new AxiosError(`Request failed with status code ${res.status}`, "ERR_BAD_RESPONSE", cfg, null, response)
    }
    return { status: 200, statusText: "OK", data: res.data, headers: new AxiosHeaders(res.headers ?? {}), config: cfg }
  }
  return { svc, calls }
}

/** One sample's props, transformed exactly as ingestion does it. */
async function propsBooks(name: Sample, commence: Date): Promise<GameBooks> {
  const ev = sample(name, commence)
  const { svc } = aggregator(() => ({ data: ev, headers: { "x-requests-last": "4" } }))
  const { books } = await svc.fetchEventProps(ev.sport_key, ev.id)
  return books!
}

// ─── An in-memory stand-in for the Prisma calls these paths make ─────────────

type Row = Record<string, unknown>

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, cond]) => {
    const v = row[k]
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { in?: unknown[]; not?: unknown; gt?: Date; lt?: Date }
      if (c.in && !c.in.includes(v)) return false
      if ("not" in c && v === c.not) return false
      if (c.gt && !((v as Date) > c.gt)) return false
      if (c.lt && !((v as Date) < c.lt)) return false
      return true
    }
    return v === cond
  })
}

/** What HOLDS_PROPS and HOLDS_GAME_LINES test in SQL, on a stored markets object. */
const holdsProps = (m: unknown) =>
  !!m && typeof m === "object" && !Array.isArray(m) && Object.keys(m).some((k) => k.includes("|"))
const holdsGameLines = (m: unknown) =>
  !!m && typeof m === "object" && ["moneyline", "spread", "total"].some((k) => k in (m as object))

class FakePrisma {
  games: Row[] = []
  snapshots: { id: string; gameId: string; provider: string; isClosing: boolean; markets: unknown; capturedAt: Date }[] = []
  predictions: Row[] = []
  propsFetches: Row[] = []
  queries: string[] = []
  private seq = 0
  private next = (prefix: string) => `${prefix}${++this.seq}`

  game = {
    upsert: async ({ where, create, update }: { where: { canonicalId: string }; create: Row; update: Row }) => {
      const found = this.games.find((g) => g.canonicalId === where.canonicalId)
      if (found) return Object.assign(found, update)
      const row = { id: this.next("game"), homeScore: null, awayScore: null, ...create }
      this.games.push(row)
      return row
    },
    findMany: async ({ where }: { where: Row }) =>
      this.games
        .filter((g) => matches(g, where))
        .sort((a, b) => (a.commenceTime as Date).getTime() - (b.commenceTime as Date).getTime()),
    findUnique: async ({ where }: { where: { id: string } }) => this.games.find((g) => g.id === where.id) ?? null,
    findFirst: async ({ where }: { where: Row }) => this.games.find((g) => matches(g, where)) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Row }) =>
      Object.assign(this.games.find((g) => g.id === where.id)!, data),
  }

  oddsSnapshot = {
    create: async ({ data }: { data: { gameId: string; provider: string; isClosing: boolean; markets: unknown } }) => {
      const row = { id: this.next("snap"), capturedAt: new Date(), ...data }
      this.snapshots.push(row)
      return row
    },
    findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
      this.snapshots.filter((s) => where.id.in.includes(s.id)),
    findUnique: async ({ where }: { where: { id: string } }) => this.snapshots.find((s) => s.id === where.id) ?? null,
  }

  prediction = {
    findMany: async ({ where, include }: { where: Row; include?: { game?: boolean } }) =>
      this.predictions
        .filter((p) => matches(p, where))
        .map((p) => (include?.game ? { ...p, game: this.games.find((g) => g.id === p.gameId) } : p)),
    findFirst: async ({ where }: { where: Row }) => this.predictions.find((p) => matches(p, where)) ?? null,
    create: async ({ data }: { data: Row }) => {
      const row = { id: this.next("pred"), status: "pending", source: "engine", ...data }
      this.predictions.push(row)
      return row
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) =>
      Object.assign(this.predictions.find((p) => p.id === where.id)!, data),
  }

  propsFetch = {
    create: async ({ data }: { data: Row }) => {
      const row = { id: this.next("fetch"), slot: null, eventId: null, markets: 0, ...data }
      this.propsFetches.push(row)
      return row
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) =>
      Object.assign(this.propsFetches.find((f) => f.id === where.id)!, data),
  }

  /**
   * The raw queries in these paths all pick the newest snapshot per game that
   * holds one kind of market, optionally bounded by capture time.
   */
  $queryRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = Prisma.sql(strings, ...(values as Prisma.Sql[]))
    this.queries.push(q.sql)
    const holds = q.sql.includes("strpos(k, '|')") ? holdsProps : holdsGameLines
    const gameIds = new Set(q.values.filter((v): v is string => typeof v === "string" && v.startsWith("game")))
    const stamp = q.values.find((v): v is string => typeof v === "string" && /^\d{4}-\d\d-\d\d \d\d:/.test(v))
    const bound = stamp ? new Date(`${stamp.replace(" ", "T")}Z`) : null
    const newest = new Map<string, (typeof this.snapshots)[number]>()
    for (const s of this.snapshots) {
      if (!gameIds.has(s.gameId) || !holds(s.markets)) continue
      if (bound && q.sql.includes(`"capturedAt" >`) && !(s.capturedAt > bound)) continue
      if (bound && q.sql.includes(`"capturedAt" <`) && !(s.capturedAt < bound)) continue
      const prev = newest.get(s.gameId)
      if (!prev || s.capturedAt >= prev.capturedAt) newest.set(s.gameId, s)
    }
    return Array.from(newest.values()).map((s) => ({ id: s.id }))
  }

  $executeRaw = async () => 0
  $transaction = async <T>(fn: (tx: this) => Promise<T>) => fn(this)
}

function setup(route: Route = () => ({ status: 500 })) {
  const prisma = new FakePrisma()
  const engine = new PredictionEngineService()
  const ai = { review: jest.fn(async (bets: object[]) => bets.map((b) => ({ ...b, aiVerdict: "lean" }))) }
  const realtime = { newPrediction: jest.fn(async () => undefined) }
  const mlbStats = { getPlayerStats: jest.fn(async () => null), statForKey: jest.fn() }
  const nhlProps = { settle: jest.fn(async () => 0) }
  const { svc: agg, calls } = aggregator(route)
  const service = new PredictionsService(
    prisma as never,
    engine,
    ai as never,
    agg,
    realtime as never,
    mlbStats as never,
    nhlProps as never
  )
  return { service, prisma, engine, ai, nhlProps, calls }
}

/** A game-line snapshot: a moneyline three licensed books price. */
function moneylineBooks(gb: GameBooks): GameBooks {
  const line = (book: string, home: number, away: number) => ({
    book,
    line: {
      id: `${gb.externalId}:${book}:h2h`,
      type: "moneyline",
      name: "moneyline",
      rawName: "h2h",
      lastUpdated: new Date(),
      outcomes: [
        { id: `${gb.externalId}:h2h:${gb.homeTeam}`, name: gb.homeTeam, description: gb.homeTeam, odds: { decimal: home }, isMain: true },
        { id: `${gb.externalId}:h2h:${gb.awayTeam}`, name: gb.awayTeam, description: gb.awayTeam, odds: { decimal: away }, isMain: true },
      ],
    },
  })
  const booksByMarket = new Map([["moneyline", [line("fanduel", 1.8, 2.05), line("draftkings", 1.83, 2.0), line("betmgm", 1.8, 2.02)]]])
  return { ...gb, booksByMarket } as unknown as GameBooks
}

const allProps = { kind: "props" as const, limit: 200 }

describe("props board", () => {
  const soon = () => new Date(Date.now() + 3 * HOUR)

  it.each([
    ["nba", "NBA", 50, 88],
    ["nfl", "NFL", 29, 56],
    ["nhl", "NHL", 33, 66],
  ] as const)("%s: offers every player prop with 3+ books as marketType \"prop\", one per player, stat and side", async (name, sport, lines, sides) => {
    const gb = await propsBooks(name, soon())
    // The engine analyses only the prop markets of a snapshot: every number
    // three or more books price is one two-way line.
    const bets = new PredictionEngineService().analyzeGame(
      { id: "g", canonicalId: gb.canonicalId, sport: gb.sport, homeTeam: gb.homeTeam, awayTeam: gb.awayTeam, commenceTime: gb.commenceTime },
      propsFrom(Object.fromEntries(gb.booksByMarket)),
      { minEdgePercent: -100 }
    )
    expect(new Set(bets.map((b) => `${b.marketType}|${b.point}`)).size).toBe(lines)

    const { service } = setup()
    await service.savePropsSnapshot(gb)
    const board = await service.board({ sport, ...allProps })

    expect(board.kind).toBe("props")
    expect(board.maxPriceAgeMs).toBe(330 * 60_000)
    expect(board.candidates).toHaveLength(sides)
    for (const c of board.candidates) {
      const prop = parsePropOutcomeId(c.outcomeId)!
      expect(c.marketType).toBe("prop")
      expect(c.marketKey).toBe(`${prop.statKey}|${prop.player}`)
      expect(c.player).toBe(prop.player)
      expect(c.stat).toBe(PROP_LABELS[prop.statKey])
      expect(c.outcomeName).toBe(prop.side)
      expect(c.point).toBe(prop.point)
      expect(c.selection).toBe(`${prop.player} ${prop.side} ${prop.point} ${c.stat}`)
      expect(c.ref).toBe(`${c.gameId}~${c.outcomeId}`)
      expect(c.pricesAsOf).toBe(board.pricesAsOf)
    }
    // One number per player, stat and side.
    const keys = board.candidates.map((c) => `${c.marketKey}|${c.outcomeName}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("keeps each player's own sides, and the best-priced number of a side", async () => {
    const { service } = setup()
    await service.savePropsSnapshot(await propsBooks("nba", soon()))
    const { candidates } = await service.board({ sport: "NBA", ...allProps })

    // Under the game-line key (marketType + side + sign of the point) every
    // prop of the game would collapse into one Over and one Under.
    expect(new Set(candidates.map((c) => c.player)).size).toBe(12)
    const tatum = candidates.filter((c) => c.marketKey === "player_assists|Jayson Tatum")
    expect(tatum.map((c) => c.outcomeName).sort()).toEqual(["Over", "Under"])

    // Paul George's points are priced at two numbers by 3+ books each; the
    // board keeps, per side, the number with the better edge.
    const engine = new PredictionEngineService()
    const gb = await propsBooks("nba", soon())
    const george = engine
      .analyzeGame(
        { id: "g", canonicalId: gb.canonicalId, sport: gb.sport, homeTeam: gb.homeTeam, awayTeam: gb.awayTeam, commenceTime: gb.commenceTime },
        new Map([["player_points|Paul George", gb.booksByMarket.get("player_points|Paul George")!]]),
        { minEdgePercent: -100 }
      )
    expect(new Set(george.map((b) => b.point)).size).toBe(2)
    for (const side of ["Over", "Under"]) {
      const best = george.filter((b) => b.outcomeName === side).sort((a, b) => b.edgePercent - a.edgePercent)[0]
      const kept = candidates.filter((c) => c.marketKey === "player_points|Paul George" && c.outcomeName === side)
      expect(kept).toHaveLength(1)
      expect(kept[0].outcomeId).toBe(best.outcomeId)
    }
  })

  it("never offers an offshore or unregistered book, though they count toward the consensus", async () => {
    const { service } = setup()
    for (const name of ["nba", "nfl", "nhl"] as const) await service.savePropsSnapshot(await propsBooks(name, soon()))
    for (const sport of ["NBA", "NFL", "NHL"]) {
      const board = await service.board({ sport, ...allProps })
      expect(board.candidates.length).toBeGreaterThan(0)
      for (const c of board.candidates) expect(isRoutableBook(c.offeredBook)).toBe(true)
      for (const b of board.booksWithPrices) expect(isRoutableBook(b)).toBe(true)
      expect(board.booksWithPrices).not.toContain("bovada")
      expect(board.booksWithPrices).not.toContain("betonlineag")
    }
    // NHL's consensus leans on the offshore books: without them most lines
    // would have fewer than 3 books.
    for (const book of ["bovada", "betonlineag"]) {
      expect((await service.board({ sport: "NHL", book, ...allProps })).candidates).toEqual([])
    }
  })

  it("prices every candidate at the chosen book, and leaves out what it does not price", async () => {
    const { service } = setup()
    await service.savePropsSnapshot(await propsBooks("nfl", soon()))
    const all = await service.board({ sport: "NFL", ...allProps })
    const atFanDuel = await service.board({ sport: "NFL", book: "fanduel", ...allProps })
    expect(atFanDuel.candidates.length).toBeGreaterThan(0)
    expect(atFanDuel.candidates.length).toBeLessThan(all.candidates.length)
    for (const c of atFanDuel.candidates) expect(c.offeredBook).toBe("fanduel")
    // Caesars posted no NFL props in this sample.
    expect((await service.board({ sport: "NFL", book: "caesars", ...allProps })).candidates).toEqual([])
  })

  it("applies minProb/maxProb before the limit", async () => {
    const { service } = setup()
    await service.savePropsSnapshot(await propsBooks("nhl", soon()))
    const all = (await service.board({ sport: "NHL", ...allProps })).candidates
    const favorites = all.filter((c) => c.fairProbability >= 0.6)
    // The band is narrow and the top of the board by edge is mostly outside it.
    expect(favorites.length).toBeGreaterThan(3)
    expect(all.slice(0, 3).filter((c) => c.fairProbability >= 0.6).length).toBeLessThan(3)

    const banded = await service.board({ sport: "NHL", kind: "props", limit: 3, minProb: 0.6, maxProb: 1 })
    expect(banded.candidates.map((c) => c.ref)).toEqual(favorites.slice(0, 3).map((c) => c.ref))

    const underdogs = await service.board({ sport: "NHL", ...allProps, minProb: 0.15, maxProb: 0.4 })
    expect(underdogs.candidates.length).toBeGreaterThan(0)
    for (const c of underdogs.candidates) expect(inProbBand(c.fairProbability, { minProb: 0.15, maxProb: 0.4 })).toBe(true)
  })

  it("keeps props and game lines apart, each with its own freshness window", async () => {
    const { service, prisma } = setup()
    const gb = await propsBooks("nba", soon())
    await service.savePropsSnapshot(gb)
    const [props] = prisma.snapshots
    // A game-line poll after it, and one that found no bookmakers ({}).
    await service["saveSnapshot"](moneylineBooks(gb), { isLive: false, isProp: false })
    await service["saveSnapshot"]({ ...gb, booksByMarket: new Map() }, { isLive: false, isProp: false })
    expect(prisma.games).toHaveLength(1)

    const lines = await service.board({ sport: "NBA", limit: 200 })
    expect(lines.kind).toBe("lines")
    expect(lines.maxPriceAgeMs).toBe(90 * 60_000)
    expect(lines.candidates.map((c) => c.marketType)).toEqual(["moneyline", "moneyline"])
    for (const c of lines.candidates) expect([c.marketKey, c.player, c.stat]).toEqual([null, null, null])
    expect((await service.board({ sport: "NBA", ...allProps })).candidates).toHaveLength(88)

    // Props stay on the board for 330 minutes; game lines for 90.
    for (const s of prisma.snapshots) s.capturedAt = new Date(Date.now() - 300 * 60_000)
    expect((await service.board({ sport: "NBA", limit: 200 })).candidates).toEqual([])
    expect((await service.board({ sport: "NBA", ...allProps })).candidates).toHaveLength(88)
    props.capturedAt = new Date(Date.now() - 340 * 60_000)
    expect((await service.board({ sport: "NBA", ...allProps })).candidates).toEqual([])
  })

  it("reads the props freshness window from PROPS_MAX_PRICE_AGE_MIN", () => {
    expect(propsMaxPriceAgeMs(undefined)).toBe(330 * 60_000)
    expect(propsMaxPriceAgeMs("")).toBe(330 * 60_000)
    expect(propsMaxPriceAgeMs("abc")).toBe(330 * 60_000)
    expect(propsMaxPriceAgeMs("0")).toBe(330 * 60_000)
    expect(propsMaxPriceAgeMs("180")).toBe(180 * 60_000)
  })

  it("only offers games that have not started", async () => {
    const { service } = setup()
    await service.savePropsSnapshot(await propsBooks("nhl", new Date(Date.now() - 5 * 60_000)))
    expect((await service.board({ sport: "NHL", ...allProps })).candidates).toEqual([])
  })
})

describe("board helpers", () => {
  it("dedupes props by player, stat and side, and game lines by the sign of the point", () => {
    const prop = (outcomeName: string, point: number) =>
      boardSideKey({ gameId: "g", marketType: "prop", marketKey: "player_points|LeBron James", outcomeName, point })
    expect(prop("Over", 24.5)).toBe(prop("Over", 25.5))
    expect(prop("Over", 24.5)).not.toBe(prop("Under", 24.5))
    expect(prop("Over", 24.5)).not.toBe(
      boardSideKey({ gameId: "g", marketType: "prop", marketKey: "player_points|Anthony Davis", outcomeName: "Over", point: 24.5 })
    )
    const spread = (point: number) => boardSideKey({ gameId: "g", marketType: "spread", marketKey: null, outcomeName: "Lakers", point })
    expect(spread(-3)).toBe(spread(-3.5))
    expect(spread(-1.5)).not.toBe(spread(1.5))
  })

  it("reads a prop's player and stat back from its key and outcome id", () => {
    expect(propFields("player_threes|Paolo Banchero", "ev1:player_threes:Paolo Banchero:Under:1.5")).toEqual({
      marketKey: "player_threes|Paolo Banchero",
      player: "Paolo Banchero",
      stat: "3-Pointers",
    })
    // A key that does not match its outcome, or a game-line outcome.
    expect(propFields("player_points|Someone Else", "ev1:player_threes:Paolo Banchero:Under:1.5")).toBeNull()
    expect(propFields("total", "ev1:totals:Over:221.5")).toBeNull()
  })

  it("accepts only the two board kinds", () => {
    expect(isBoardKind("lines")).toBe(true)
    expect(isBoardKind("props")).toBe(true)
    expect(isBoardKind("prop")).toBe(false)
    expect(isBoardKind(undefined)).toBe(false)
  })
})

describe("board endpoint", () => {
  function controller() {
    const board = jest.fn(async () => ({}))
    return { board, ctrl: new PredictionsController({ board } as unknown as PredictionsService) }
  }

  it("passes kind and the win-chance band through", () => {
    const { board, ctrl } = controller()
    ctrl.board("NBA", "fanduel", "200", "props", "0.4", "0.62")
    expect(board).toHaveBeenCalledWith({ sport: "NBA", book: "fanduel", limit: 200, kind: "props", minProb: 0.4, maxProb: 0.62 })
    ctrl.board("NBA")
    expect(board).toHaveBeenLastCalledWith({ sport: "NBA", book: null, limit: undefined, kind: undefined, minProb: undefined, maxProb: undefined })
  })

  it.each([
    ["an unknown kind", ["prop", undefined, undefined]],
    ["a win chance above 1", ["props", "1.5", undefined]],
    ["a negative win chance", ["props", undefined, "-0.1"]],
    ["a win chance that is not a number", ["props", "low", undefined]],
    ["a repeated win chance", ["props", ["0.2", "0.3"], undefined]],
    ["minProb above maxProb", ["props", "0.7", "0.6"]],
  ])("rejects %s with a 400", (_label, [kind, minProb, maxProb]) => {
    const { board, ctrl } = controller()
    expect(() => ctrl.board("NBA", undefined, undefined, kind as string, minProb as string, maxProb as string)).toThrow(
      expect.objectContaining({ status: 400 })
    )
    expect(board).not.toHaveBeenCalled()
  })
})

describe("prop refs", () => {
  async function boardFor(name: Sample, sport: string) {
    const ctx = setup()
    await ctx.service.savePropsSnapshot(await propsBooks(name, new Date(Date.now() + 3 * HOUR)))
    const board = await ctx.service.board({ sport, ...allProps })
    return { ...ctx, board }
  }

  it("turns a prop ref into a \"prop\" row for exactly that player, stat, side and number", async () => {
    const { service, prisma, board } = await boardFor("nba", "NBA")
    const over = board.candidates.find((c) => c.marketKey === "player_assists|Jayson Tatum" && c.outcomeName === "Over")!
    const under = board.candidates.find((c) => c.marketKey === "player_assists|Jayson Tatum" && c.outcomeName === "Under")!

    const slip = await service.betslipFor([], { refs: [over.ref, under.ref], book: "draftkings", state: "NJ" })
    expect(slip.unresolvedRefs).toEqual([])
    expect(prisma.predictions).toHaveLength(2)
    for (const [c, row] of [
      [over, prisma.predictions[0]],
      [under, prisma.predictions[1]],
    ] as [BoardCandidate, Row][]) {
      expect(row).toMatchObject({
        source: "board",
        marketType: "prop",
        outcomeId: c.outcomeId,
        selection: c.selection,
        outcomeName: c.outcomeName,
        point: c.point,
        fairProbability: c.fairProbability,
      })
    }
    expect(slip.legs.map((l) => [l.marketType, l.selection])).toEqual([
      ["prop", over.selection],
      ["prop", under.selection],
    ])
    for (const leg of slip.legs) {
      expect(leg.pricesAsOf).toBe(over.pricesAsOf)
      expect(leg.atBook?.book).toBe("draftkings")
      expect(leg.atBook?.linkKind).toBe("betslip")
    }
    // Same game: per-leg links only, and the slip says to build the SGP there.
    expect(slip.parlayLink).toBeNull()
    expect(slip.note).toContain("Same Game Parlay")

    // Asking again reuses the rows.
    await service.betslipFor([], { refs: [over.ref], book: "draftkings" })
    expect(prisma.predictions).toHaveLength(2)
  })

  it("names the refs it could not resolve instead of dropping them", async () => {
    const { service, prisma, board } = await boardFor("nhl", "NHL")
    const good = board.candidates[0]
    const prop = parsePropOutcomeId(good.outcomeId)!
    // The same player and stat at a number no book prices, and a player with no line.
    const moved = `${good.gameId}~${prop.eventId}:${prop.statKey}:${prop.player}:${prop.side}:${prop.point + 10}`
    const unknown = `${good.gameId}~${prop.eventId}:${prop.statKey}:Nobody Atall:Over:0.5`

    const slip = await service.betslipFor([], { refs: [good.ref, moved, unknown], book: "fanduel" })
    expect(slip.unresolvedRefs).toEqual([moved, unknown])
    expect(slip.legs).toHaveLength(1)
    expect(prisma.predictions).toHaveLength(1)
    expect(slip.note).toMatch(/^2 of these picks are no longer in the latest prices/)
  })

  it("does not resolve a prop ref from a game-line snapshot, or a game-line ref from a props one", async () => {
    const { service, prisma } = setup()
    const gb = await propsBooks("nba", new Date(Date.now() + 3 * HOUR))
    await service["saveSnapshot"](moneylineBooks(gb), { isLive: false, isProp: false })
    const gameId = prisma.games[0].id as string
    const propRef = `${gameId}~${gb.externalId}:player_assists:Jayson Tatum:Over:6.5`
    const lineRef = `${gameId}~${gb.externalId}:h2h:${gb.homeTeam}`

    let slip = await service.betslipFor([], { refs: [propRef, lineRef] })
    expect(slip.unresolvedRefs).toEqual([propRef])
    expect(prisma.predictions.map((p) => p.marketType)).toEqual(["moneyline"])

    // The props snapshot arrives, then an empty game-line poll after it.
    await service.savePropsSnapshot(gb)
    await service["saveSnapshot"]({ ...gb, booksByMarket: new Map() }, { isLive: false, isProp: false })
    slip = await service.betslipFor([], { refs: [propRef, lineRef] })
    expect(slip.unresolvedRefs).toEqual([])
    expect(prisma.predictions.map((p) => p.marketType)).toEqual(["moneyline", "prop"])
    expect(slip.legs.map((l) => l.pricesAsOf)).toEqual(
      expect.arrayContaining([prisma.snapshots[0].capturedAt.toISOString(), prisma.snapshots[1].capturedAt.toISOString()])
    )
  })

  it("does not resolve a ref once the game has started", async () => {
    const { service, prisma, board } = await boardFor("nfl", "NFL")
    prisma.games[0].commenceTime = new Date(Date.now() - 60_000)
    const slip = await service.betslipFor([], { refs: [board.candidates[0].ref] })
    expect(slip.unresolvedRefs).toEqual([board.candidates[0].ref])
    expect(prisma.predictions).toHaveLength(0)
  })
})

describe("props snapshots and the admin props call", () => {
  it("savePropsSnapshot stores the game and a props snapshot, never live or closing", async () => {
    const { service, prisma } = setup()
    // 30 minutes out: a game-line snapshot this close would be flagged closing.
    const gb = await propsBooks("nhl", new Date(Date.now() + 30 * 60_000))
    await service.savePropsSnapshot(gb)
    expect(prisma.games).toEqual([expect.objectContaining({ canonicalId: gb.canonicalId, status: "scheduled", sport: "NHL" })])
    expect(prisma.snapshots).toEqual([expect.objectContaining({ provider: "the-odds-api:props", isClosing: false })])
    const keys = Object.keys(prisma.snapshots[0].markets as object)
    expect(keys).toHaveLength(33)
    for (const k of keys) expect(k).toContain("|")
  })

  function adminRoute(ev: { id: string }, events: object[], odds: () => ReturnType<Route>): Route {
    return (url) => {
      if (url.endsWith("/events")) return { data: events, headers: { "x-requests-last": "0", "x-requests-remaining": "19000" } }
      if (url.includes(`/events/${ev.id}/odds`)) return odds()
      throw new Error(`unexpected call ${url}`)
    }
  }
  const listing = (id: string, start: Date) => ({ id, home_team: "H", away_team: "A", commence_time: start.toISOString() })

  it("stores NBA props for the board only, records the credits, and skips started and far-off games", async () => {
    const ev = sample("nba", new Date(Date.now() + 2 * HOUR))
    const events = [
      listing("started", new Date(Date.now() - 30 * 60_000)),
      listing(ev.id, new Date(Date.now() + 2 * HOUR)),
      listing("far", new Date(Date.now() + 40 * HOUR)),
    ]
    const ctx = setup(adminRoute(ev, events, () => ({ data: ev, headers: { "x-requests-last": "4", "x-requests-remaining": "18996" } })))
    const analyze = jest.spyOn(ctx.engine, "analyzeGame")

    const result = await ctx.service.ingestPropsAndPredict("basketball_nba", 5)
    expect(result).toEqual({ events: 1, predictions: 0, credits: 4 })
    expect(ctx.calls.filter((u) => u.includes("/odds"))).toEqual([`/sports/basketball_nba/events/${ev.id}/odds`])
    expect(ctx.prisma.propsFetches).toEqual([
      expect.objectContaining({ sportKey: "basketball_nba", eventId: ev.id, slot: null, kind: "manual", cost: 4, markets: 45 }),
    ])
    expect(ctx.prisma.snapshots).toHaveLength(1)
    // NBA props cannot be graded, so no engine picks: no engine run, no AI call.
    expect(analyze).not.toHaveBeenCalled()
    expect(ctx.ai.review).not.toHaveBeenCalled()
    expect(ctx.prisma.predictions).toHaveLength(0)
  })

  it("makes engine picks for NHL, whose props are graded, always as marketType \"prop\"", async () => {
    const ev = sample("nhl", new Date(Date.now() + 2 * HOUR))
    const ctx = setup(adminRoute(ev, [listing(ev.id, new Date(Date.now() + 2 * HOUR))], () => ({ data: ev, headers: { "x-requests-last": "2" } })))
    const result = await ctx.service.ingestPropsAndPredict("icehockey_nhl", 5, { minEdgePercent: -100 })
    expect(result.predictions).toBe(66)
    expect(new Set(ctx.prisma.predictions.map((p) => p.marketType))).toEqual(new Set(["prop"]))
    expect(ctx.prisma.propsFetches).toEqual([expect.objectContaining({ kind: "manual", cost: 2, markets: 33 })])
  })

  it("fails on a rejected key or exhausted quota, keeping the estimated cost", async () => {
    const ev = sample("nfl", new Date(Date.now() + 2 * HOUR))
    const ctx = setup(adminRoute(ev, [listing(ev.id, new Date(Date.now() + 2 * HOUR))], () => ({ status: 401, data: { error_code: "OUT_OF_USAGE_CREDITS" } })))
    const err = await ctx.service.ingestPropsAndPredict("americanfootball_nfl", 5).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OddsApiError)
    expect((err as OddsApiError).isAuthFailure).toBe(true)
    // 5 NFL markets x 1 region.
    expect(ctx.prisma.propsFetches).toEqual([expect.objectContaining({ kind: "manual", cost: 5, markets: 0 })])
  })

  it("logs other failures and carries on with the next game", async () => {
    const ev = sample("nfl", new Date(Date.now() + 2 * HOUR))
    const route: Route = (url) => {
      if (url.endsWith("/events"))
        return { data: [listing("broken", new Date(Date.now() + HOUR)), listing(ev.id, new Date(Date.now() + 2 * HOUR))] }
      if (url.includes("/events/broken/odds")) return { status: 500 }
      if (url.includes(`/events/${ev.id}/odds`)) return { data: ev, headers: { "x-requests-last": "5" } }
      throw new Error(`unexpected call ${url}`)
    }
    const ctx = setup(route)
    const result = await ctx.service.ingestPropsAndPredict("americanfootball_nfl", 5)
    expect(result).toEqual({ events: 2, predictions: 0, credits: 10 })
    expect(ctx.prisma.propsFetches.map((f) => [f.eventId, f.cost])).toEqual([
      ["broken", 5],
      [ev.id, 5],
    ])
    expect(ctx.prisma.snapshots).toHaveLength(1)
  })
})

describe("settling props", () => {
  function settleRoute(gb: { externalId: string; homeTeam: string; awayTeam: string }): Route {
    return (url) => {
      if (url.endsWith("/scores")) {
        return {
          data: [
            {
              id: gb.externalId,
              completed: true,
              home_team: gb.homeTeam,
              away_team: gb.awayTeam,
              scores: [
                { name: gb.homeTeam, score: "3" },
                { name: gb.awayTeam, score: "2" },
              ],
            },
          ],
        }
      }
      throw new Error(`unexpected call ${url}`)
    }
  }

  it("grades NHL props with the NHL grader, by sport key", async () => {
    const gb = await propsBooks("nhl", new Date(Date.now() - 4 * HOUR))
    const ctx = setup(settleRoute(gb))
    await ctx.service.savePropsSnapshot(gb)
    ctx.nhlProps.settle.mockResolvedValueOnce(3)
    const result = await ctx.service.settleSport("icehockey_nhl")
    const game = ctx.prisma.games[0]
    expect(ctx.nhlProps.settle).toHaveBeenCalledWith(game.id, gb.homeTeam, gb.awayTeam, gb.commenceTime)
    expect(result).toEqual({ settled: 3 })
    expect(game.status).toBe("final")
  })

  it("leaves NBA props to no grader", async () => {
    const gb = await propsBooks("nba", new Date(Date.now() - 4 * HOUR))
    const ctx = setup(settleRoute(gb))
    await ctx.service.savePropsSnapshot(gb)
    await ctx.service.settleSport("basketball_nba")
    expect(ctx.nhlProps.settle).not.toHaveBeenCalled()
  })
})
