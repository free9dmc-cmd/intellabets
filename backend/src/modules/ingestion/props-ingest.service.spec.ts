import { Logger } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"
import type { PrismaService } from "../../common/prisma/prisma.service"
import type { PredictionsService } from "../predictions/predictions.service"
import { OddsApiError, type GameBooks, type OddsAggregatorService } from "./odds-aggregator.service"
import { PropsIngestService } from "./props-ingest.service"

// Only savePropsSnapshot is used, through the fake below; the real module
// pulls in the whole engine.
jest.mock("../predictions/predictions.service", () => ({ PredictionsService: class PredictionsService {} }))

interface Row {
  id: string
  sportKey: string
  eventId: string | null
  slot: string | null
  kind: string
  cost: number
  markets: number
  fetchedAt: Date
}

const NOW = new Date("2026-11-15T18:00:00Z")
const minutesFromNow = (m: number) => new Date(NOW.getTime() + m * 60_000)

/** An in-memory PropsFetch table with the unique slot Postgres enforces. */
function fakePrisma(rows: Row[] = []) {
  let next = rows.length
  const bySlot = (slot: string) => rows.find((r) => r.slot === slot)
  const prisma = {
    rows,
    propsFetch: {
      findUnique: jest.fn(async ({ where }: { where: { slot: string } }) => bySlot(where.slot) ?? null),
      create: jest.fn(async ({ data }: { data: Partial<Row> & { sportKey: string; kind: string; cost: number } }) => {
        if (data.slot && bySlot(data.slot)) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
        const row: Row = { id: `r${next++}`, eventId: null, slot: null, markets: 0, fetchedAt: NOW, ...data }
        rows.push(row)
        return row
      }),
      update: jest.fn(async ({ where, data }: { where: { slot: string }; data: Partial<Row> }) => {
        const row = bySlot(where.slot)
        if (!row) throw new Error("not found")
        Object.assign(row, data)
        return row
      }),
      delete: jest.fn(async ({ where }: { where: { slot: string } }) => {
        const i = rows.findIndex((r) => r.slot === where.slot)
        if (i < 0) throw new Error("not found")
        return rows.splice(i, 1)[0]
      }),
      aggregate: jest.fn(async ({ where }: { where: { fetchedAt: { gte: Date } } }) => ({
        _sum: { cost: rows.filter((r) => r.fetchedAt >= where.fetchedAt.gte).reduce((s, r) => s + r.cost, 0) || null },
      })),
      findFirst: jest.fn(async () => (rows.length ? [...rows].sort((a, b) => +b.fetchedAt - +a.fetchedAt)[0] : null)),
    },
    $executeRaw: jest.fn(async (..._args: unknown[]) => 0),
  }
  return prisma
}

function books(lines: number): GameBooks {
  const booksByMarket = new Map(Array.from({ length: lines }, (_, i) => [`player_points|Player ${i}`, []]))
  return { canonicalId: "NBA:Orlando Magic:Boston Celtics:2026-11-15", booksByMarket } as unknown as GameBooks
}

const event = (id: string, minutes: number) => ({
  id,
  homeTeam: "Orlando Magic",
  awayTeam: "Boston Celtics",
  commenceTime: minutesFromNow(minutes),
})

function setup(opts: { rows?: Row[]; env?: Record<string, string>; events?: ReturnType<typeof event>[]; remaining?: number | null } = {}) {
  const prisma = fakePrisma(opts.rows)
  const aggregator = {
    isConfigured: jest.fn(() => true),
    propMarketsFor: jest.fn((k: string) =>
      k === "basketball_nba" ? ["player_points", "player_rebounds", "player_assists", "player_threes"] : []
    ),
    propsRegions: jest.fn(() => "us"),
    propsSportKeys: jest.fn(() => ["basketball_nba"]),
    sportFor: jest.fn((k: string) => (k === "basketball_nba" ? "NBA" : null)),
    status: jest.fn(() => ({ lastSuccessAt: null, lastError: null, quota: null })),
    fetchEvents: jest.fn(async () => ({
      events: opts.events ?? [event("late-evt", 90), event("early-evt", 300)],
      cost: 0,
      remaining: opts.remaining === undefined ? 19_000 : opts.remaining,
    })),
    fetchEventProps: jest.fn(async (_k: string, _id: string) => ({
      books: books(40) as GameBooks | null,
      cost: 4 as number | null,
      remaining: 18_996 as number | null,
    })),
  }
  const predictions = { savePropsSnapshot: jest.fn(async () => undefined) }
  const values = opts.env ?? {}
  const config = { get: (k: string) => values[k] }
  const svc = new PropsIngestService(
    prisma as unknown as PrismaService,
    aggregator as unknown as OddsAggregatorService,
    predictions as unknown as PredictionsService,
    config as unknown as ConfigService
  )
  return { svc, prisma, aggregator, predictions }
}

const row = (data: Partial<Row>): Row => ({
  id: `seed-${Math.random()}`,
  sportKey: "basketball_nba",
  eventId: null,
  slot: null,
  kind: "event",
  cost: 0,
  markets: 0,
  fetchedAt: new Date("2026-11-02T00:00:00Z"),
  ...data,
})

let warn: jest.SpyInstance
beforeEach(() => {
  warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined)
  jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined)
  jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined)
  jest.spyOn(Logger.prototype, "debug").mockImplementation(() => undefined)
})
afterEach(() => jest.restoreAllMocks())

describe("PropsIngestService.run", () => {
  it("fetches each due event once per window, late first, and records what it cost", async () => {
    const { svc, prisma, aggregator, predictions } = setup()
    const result = await svc.run("basketball_nba", NOW)

    expect(aggregator.fetchEventProps.mock.calls.map((c) => c[1])).toEqual(["late-evt", "early-evt"])
    expect(result).toMatchObject({ listed: 2, fetched: 2, early: 1, late: 1, skipped: 0, credits: 8 })
    expect(prisma.rows.map((r) => [r.slot, r.kind, r.cost, r.markets])).toEqual([
      ["late-evt:late", "event", 4, 40],
      ["early-evt:early", "event", 4, 40],
    ])
    expect(predictions.savePropsSnapshot).toHaveBeenCalledTimes(2)

    // The next tick finds both slots taken and spends nothing.
    const again = await svc.run("basketball_nba", new Date(NOW.getTime() + 30 * 60_000))
    expect(aggregator.fetchEventProps).toHaveBeenCalledTimes(2)
    expect(again).toMatchObject({ fetched: 0, credits: 0 })
    expect(prisma.rows).toHaveLength(2)
  })

  it("runs one sport at a time, so concurrent jobs cannot share the last credits", async () => {
    // Room for one more 4-credit call this month.
    const { svc, aggregator } = setup({ rows: [row({ cost: 3494 })] })
    aggregator.fetchEvents
      .mockResolvedValueOnce({ events: [event("game-a", 90)], cost: 0, remaining: 19_000 })
      .mockResolvedValueOnce({ events: [event("game-b", 90)], cost: 0, remaining: 19_000 })
    let release!: () => void
    aggregator.fetchEventProps.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => (release = resolve))
      return { books: books(3), cost: 4, remaining: 18_996 }
    })
    const first = svc.run("basketball_nba", NOW)
    const second = svc.run("basketball_nba", NOW)
    await new Promise((r) => setImmediate(r))
    expect(aggregator.fetchEvents).toHaveBeenCalledTimes(1)
    release()
    await expect(first).resolves.toMatchObject({ fetched: 1, credits: 4 })
    // The second run checks the cap only after the first has spent.
    await expect(second).resolves.toMatchObject({ fetched: 0, skipped: 1 })
    expect(aggregator.fetchEventProps.mock.calls.map((c) => c[1])).toEqual(["game-a"])
  })

  it("keeps running after a failed run", async () => {
    const { svc, aggregator } = setup({ events: [event("late-evt", 90)] })
    aggregator.fetchEvents.mockRejectedValueOnce(new Error("socket hang up"))
    await expect(svc.run("basketball_nba", NOW)).rejects.toThrow("socket hang up")
    await expect(svc.run("basketball_nba", NOW)).resolves.toMatchObject({ fetched: 1 })
  })

  it("leaves a slot another run claimed first", async () => {
    const { svc, prisma, aggregator } = setup({ events: [event("late-evt", 90)] })
    // The other run's claim lands between this run's check and its claim.
    prisma.propsFetch.findUnique.mockResolvedValueOnce(null)
    prisma.rows.push(row({ slot: "late-evt:late", cost: 4, fetchedAt: NOW }))
    const result = await svc.run("basketball_nba", NOW)
    expect(aggregator.fetchEventProps).not.toHaveBeenCalled()
    expect(result.fetched).toBe(0)
    expect(prisma.rows).toHaveLength(1)
  })

  it("skips early fetches past 80% of the monthly cap but still makes late ones", async () => {
    const { svc, aggregator } = setup({ rows: [row({ cost: 2798, kind: "manual" })] })
    const result = await svc.run("basketball_nba", NOW)
    expect(aggregator.fetchEventProps.mock.calls.map((c) => c[1])).toEqual(["late-evt"])
    expect(result).toMatchObject({ fetched: 1, late: 1, early: 0, skipped: 1 })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("skipping early-window fetches"))
  })

  it("skips everything over the cap, logging once per window", async () => {
    const { svc, aggregator } = setup({
      rows: [row({ cost: 3497 })],
      events: [event("late-1", 60), event("late-2", 70), event("early-1", 300)],
    })
    const result = await svc.run("basketball_nba", NOW)
    expect(aggregator.fetchEventProps).not.toHaveBeenCalled()
    expect(result).toMatchObject({ fetched: 0, skipped: 3, credits: 0 })
    const capWarnings = warn.mock.calls.filter(([m]) => String(m).includes("PROPS_CREDIT_CAP_MONTH"))
    expect(capWarnings).toHaveLength(2) // one for late, one for early
  })

  it("counts only this month's spend toward the cap", async () => {
    const { svc, aggregator } = setup({ rows: [row({ cost: 3500, fetchedAt: new Date("2026-10-31T23:59:00Z") })] })
    await svc.run("basketball_nba", NOW)
    expect(aggregator.fetchEventProps).toHaveBeenCalledTimes(2)
  })

  it("honours PROPS_CREDIT_CAP_MONTH", async () => {
    const { svc, aggregator } = setup({ env: { PROPS_CREDIT_CAP_MONTH: "5" }, events: [event("late-1", 60), event("late-2", 70)] })
    const result = await svc.run("basketball_nba", NOW)
    expect(aggregator.fetchEventProps.mock.calls.map((c) => c[1])).toEqual(["late-1"])
    expect(result).toMatchObject({ fetched: 1, skipped: 1, credits: 4 })
  })

  it("releases a claim when the call was free and returned nothing, so the next tick retries", async () => {
    const { svc, prisma, aggregator, predictions } = setup({ events: [event("late-evt", 90)] })
    aggregator.fetchEventProps.mockResolvedValueOnce({ books: books(0), cost: 0, remaining: 19_000 })
    const first = await svc.run("basketball_nba", NOW)
    expect(first).toMatchObject({ fetched: 0, credits: 0 })
    expect(prisma.rows).toHaveLength(0)
    expect(predictions.savePropsSnapshot).not.toHaveBeenCalled()

    await svc.run("basketball_nba", new Date(NOW.getTime() + 30 * 60_000))
    expect(aggregator.fetchEventProps).toHaveBeenCalledTimes(2)
    expect(prisma.rows.map((r) => [r.slot, r.cost])).toEqual([["late-evt:late", 4]])
  })

  it("keeps a charged claim even when no two-way line came back", async () => {
    const { svc, prisma, aggregator, predictions } = setup({ events: [event("late-evt", 90)] })
    aggregator.fetchEventProps.mockResolvedValueOnce({ books: books(0), cost: 1, remaining: 19_000 })
    await svc.run("basketball_nba", NOW)
    expect(prisma.rows.map((r) => [r.slot, r.cost, r.markets])).toEqual([["late-evt:late", 1, 0]])
    expect(predictions.savePropsSnapshot).not.toHaveBeenCalled()
  })

  it("keeps the estimate when the response carries no cost header", async () => {
    const { svc, prisma, aggregator } = setup({ events: [event("late-evt", 90)] })
    aggregator.fetchEventProps.mockResolvedValueOnce({ books: books(3), cost: null, remaining: null })
    const result = await svc.run("basketball_nba", NOW)
    expect(prisma.rows.map((r) => r.cost)).toEqual([4])
    expect(result.credits).toBe(4)
  })

  it("stops below the remaining-credits floor", async () => {
    const { svc, aggregator } = setup({ remaining: 1003 })
    const result = await svc.run("basketball_nba", NOW)
    expect(aggregator.fetchEventProps).not.toHaveBeenCalled()
    expect(result.skipped).toBe(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("PROPS_MIN_REMAINING_CREDITS"))
  })

  it("stops once a call leaves the credits under the floor", async () => {
    const { svc, aggregator } = setup({ remaining: 1010 })
    aggregator.fetchEventProps.mockResolvedValueOnce({ books: books(3), cost: 4, remaining: 1003 })
    const result = await svc.run("basketball_nba", NOW)
    expect(aggregator.fetchEventProps).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ fetched: 1, skipped: 1 })
  })

  it("falls back to the feed's last seen credits when the listing has no header", async () => {
    const { svc, aggregator } = setup({ remaining: null })
    aggregator.status.mockReturnValue({ lastSuccessAt: null, lastError: null, quota: { remaining: 500 } } as never)
    await svc.run("basketball_nba", NOW)
    expect(aggregator.fetchEventProps).not.toHaveBeenCalled()
  })

  it("rethrows an auth failure, keeping the claim at the estimate", async () => {
    const { svc, prisma, aggregator } = setup()
    const denied = new OddsApiError("The Odds API 401 OUT_OF_USAGE_CREDITS", 401, "OUT_OF_USAGE_CREDITS")
    aggregator.fetchEventProps.mockRejectedValueOnce(denied)
    await expect(svc.run("basketball_nba", NOW)).rejects.toBe(denied)
    expect(aggregator.fetchEventProps).toHaveBeenCalledTimes(1)
    expect(prisma.rows.map((r) => [r.slot, r.cost])).toEqual([["late-evt:late", 4]])
  })

  it("logs any other failure and moves on to the next event", async () => {
    const { svc, prisma, aggregator } = setup()
    aggregator.fetchEventProps.mockRejectedValueOnce(new OddsApiError("The Odds API 500", 500, null))
    const result = await svc.run("basketball_nba", NOW)
    expect(aggregator.fetchEventProps).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ fetched: 1, credits: 8 })
    expect(prisma.rows.map((r) => [r.slot, r.cost])).toEqual([
      ["late-evt:late", 4],
      ["early-evt:early", 4],
    ])
  })

  it("records a listing that is no longer free", async () => {
    const { svc, prisma, aggregator } = setup({ events: [] })
    aggregator.fetchEvents.mockResolvedValueOnce({ events: [], cost: 1, remaining: 19_000 })
    const result = await svc.run("basketball_nba", NOW)
    expect(prisma.rows.map((r) => [r.kind, r.cost, r.slot])).toEqual([["listing", 1, null]])
    expect(result.credits).toBe(1)
  })

  it("sizes the estimate by markets x props regions", async () => {
    const { svc, prisma, aggregator } = setup({ events: [event("late-evt", 90)] })
    aggregator.propsRegions.mockReturnValue("us,us2")
    aggregator.fetchEventProps.mockRejectedValueOnce(new Error("socket hang up"))
    await svc.run("basketball_nba", NOW)
    expect(prisma.rows.map((r) => r.cost)).toEqual([8])
  })

  it("does nothing without a key or prop markets", async () => {
    const off = setup()
    off.aggregator.isConfigured.mockReturnValue(false)
    await off.svc.run("basketball_nba", NOW)
    expect(off.aggregator.fetchEvents).not.toHaveBeenCalled()

    const none = setup()
    await none.svc.run("soccer_epl", NOW)
    expect(none.aggregator.fetchEvents).not.toHaveBeenCalled()
  })

  it("deletes the sport's props snapshots of games that started over the retention days ago", async () => {
    const { svc, prisma } = setup({ events: [], env: { PROPS_SNAPSHOT_RETENTION_DAYS: "3" } })
    await svc.run("basketball_nba", NOW)
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
    const [strings, ...values] = prisma.$executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]]
    const sql = strings.join("?")
    expect(sql).toContain('DELETE FROM "OddsSnapshot"')
    expect(sql).toContain("CASE WHEN jsonb_typeof(s.markets) = 'object'")
    expect(sql).toContain("strpos(k, '|') > 0")
    expect(values).toEqual(["NBA", "2026-11-12 18:00:00.000"])
  })
})

describe("PropsIngestService settings and status", () => {
  it("falls back to the defaults for missing or bad settings", () => {
    const { svc } = setup({ env: { PROPS_INTERVAL_MIN: "0", PROPS_CREDIT_CAP_MONTH: "lots", PROPS_EARLY_WINDOW_MIN: "300-200" } })
    expect(svc.intervalMin()).toBe(30)
    expect(svc.creditCap()).toBe(3500)
    expect(svc.windows()).toEqual({ early: { lo: 240, hi: 360 }, late: { lo: 45, hi: 105 } })
  })

  it("reads the settings", () => {
    const { svc } = setup({
      env: { PROPS_INTERVAL_MIN: "15", PROPS_CREDIT_CAP_MONTH: "2000", PROPS_LATE_WINDOW_MIN: "30-90" },
    })
    expect(svc.intervalMin()).toBe(15)
    expect(svc.creditCap()).toBe(2000)
    expect(svc.windows().late).toEqual({ lo: 30, hi: 90 })
  })

  it("reports this month's credits and the last fetch", async () => {
    const { svc } = setup({
      rows: [
        row({ cost: 100, fetchedAt: new Date("2026-10-30T00:00:00Z") }),
        row({ cost: 4, fetchedAt: new Date("2026-11-14T00:00:00Z") }),
        row({ cost: 5, fetchedAt: new Date("2026-11-15T17:00:00Z") }),
      ],
    })
    await expect(svc.status(NOW)).resolves.toEqual({
      sports: ["basketball_nba"],
      creditsThisMonth: 9,
      cap: 3500,
      lastFetchAt: "2026-11-15T17:00:00.000Z",
    })
  })
})
