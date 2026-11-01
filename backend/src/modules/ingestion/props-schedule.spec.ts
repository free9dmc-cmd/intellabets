import {
  DEFAULT_PROPS_WINDOWS,
  budgetAllows,
  duePropsEvents,
  monthStartUtc,
  parseWindow,
  windowFor,
  windowWarnings,
} from "./props-schedule"

const W = DEFAULT_PROPS_WINDOWS

describe("parseWindow", () => {
  it("reads 'lo-hi' minutes", () => {
    expect(parseWindow("240-360", { lo: 0, hi: 1 })).toEqual({ lo: 240, hi: 360 })
    expect(parseWindow(" 45 - 105 ", { lo: 0, hi: 1 })).toEqual({ lo: 45, hi: 105 })
  })

  it("falls back on a missing or malformed setting", () => {
    const fallback = { lo: 45, hi: 105 }
    for (const raw of [undefined, null, "", "105", "105-45", "60-60", "-10-20", "a-b", "45-105-200"]) {
      expect(parseWindow(raw, fallback)).toBe(fallback)
    }
  })
})

describe("windowFor", () => {
  it("uses (lo, hi] bounds", () => {
    expect(windowFor(360, W)).toBe("early")
    expect(windowFor(300, W)).toBe("early")
    expect(windowFor(240.01, W)).toBe("early")
    expect(windowFor(360.01, W)).toBeNull()
    expect(windowFor(240, W)).toBeNull()
    expect(windowFor(105.01, W)).toBeNull()
    expect(windowFor(105, W)).toBe("late")
    expect(windowFor(45.01, W)).toBe("late")
    expect(windowFor(45, W)).toBeNull()
    expect(windowFor(0, W)).toBeNull()
    expect(windowFor(-30, W)).toBeNull()
  })

  it("prefers late when misconfigured windows overlap", () => {
    expect(windowFor(100, { early: { lo: 60, hi: 300 }, late: { lo: 45, hi: 105 } })).toBe("late")
  })
})

describe("duePropsEvents", () => {
  const now = new Date("2026-11-01T12:00:00Z")
  const at = (id: string, minutes: number) => ({ id, commenceTime: new Date(now.getTime() + minutes * 60_000) })

  it("drops started and out-of-window events and puts late fetches first", () => {
    const events = [
      at("early-far", 350),
      at("started", -5),
      at("now", 0),
      at("late", 90),
      at("gap", 200),
      at("early-near", 250),
      at("too-soon", 30),
      at("late-near", 50),
    ]
    const due = duePropsEvents(events, now, W)
    expect(due.map((d) => [d.event.id, d.window])).toEqual([
      ["late-near", "late"],
      ["late", "late"],
      ["early-near", "early"],
      ["early-far", "early"],
    ])
    expect(due[0].minsToStart).toBeCloseTo(50)
  })

  it("returns nothing for an empty listing", () => {
    expect(duePropsEvents([], now, W)).toEqual([])
  })
})

describe("budgetAllows", () => {
  it("stops early-window fetches at 80% of the cap", () => {
    expect(budgetAllows({ spent: 2796, estimate: 4, cap: 3500, window: "early" })).toBe(true) // 2800
    expect(budgetAllows({ spent: 2797, estimate: 4, cap: 3500, window: "early" })).toBe(false)
  })

  it("lets late-window fetches use the whole cap", () => {
    expect(budgetAllows({ spent: 2797, estimate: 4, cap: 3500, window: "late" })).toBe(true)
    expect(budgetAllows({ spent: 3496, estimate: 4, cap: 3500, window: "late" })).toBe(true) // 3500
    expect(budgetAllows({ spent: 3497, estimate: 4, cap: 3500, window: "late" })).toBe(false)
  })

  it("allows nothing with a zero cap", () => {
    expect(budgetAllows({ spent: 0, estimate: 2, cap: 0, window: "late" })).toBe(false)
  })
})

describe("monthStartUtc", () => {
  it("is midnight UTC on the first of the month", () => {
    expect(monthStartUtc(new Date("2026-11-17T09:30:00Z")).toISOString()).toBe("2026-11-01T00:00:00.000Z")
    expect(monthStartUtc(new Date("2026-11-01T00:00:00Z")).toISOString()).toBe("2026-11-01T00:00:00.000Z")
    expect(monthStartUtc(new Date("2026-10-31T23:59:59.999Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z")
    // 8pm in New York on Oct 31 is already November in UTC.
    expect(monthStartUtc(new Date("2026-11-01T00:30:00Z")).toISOString()).toBe("2026-11-01T00:00:00.000Z")
    expect(monthStartUtc(new Date("2027-01-05T00:00:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })
})

describe("windowWarnings", () => {
  it("is quiet for the defaults at a 30-minute tick", () => {
    expect(windowWarnings(W, 30)).toEqual([])
  })

  it("warns when a window is narrower than the tick or the windows overlap", () => {
    expect(windowWarnings(W, 90)).toEqual([expect.stringContaining("late props window (45-105 min)")])
    expect(windowWarnings({ early: { lo: 90, hi: 300 }, late: { lo: 45, hi: 105 } }, 30)).toEqual([
      expect.stringContaining("overlap"),
    ])
  })
})
