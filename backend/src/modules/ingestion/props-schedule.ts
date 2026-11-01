/**
 * When the scheduled props job fetches an event, and whether the month's
 * credit budget allows it. Pure functions, so the timing and budget rules
 * are tested without a queue, a database or the API.
 *
 * Each event is fetched at most twice: once in an early window a few hours
 * before it starts and once in a late window about an hour before. Windows
 * are (lo, hi] minutes before the start.
 */

export type PropsWindowName = "early" | "late"

/** (lo, hi] minutes before the event starts. */
export interface WindowBounds {
  lo: number
  hi: number
}

export interface PropsWindows {
  early: WindowBounds
  late: WindowBounds
}

export const DEFAULT_PROPS_WINDOWS: PropsWindows = {
  early: { lo: 240, hi: 360 },
  late: { lo: 45, hi: 105 },
}

/** Early-window fetches stop once the month's spend would pass this share of the cap. */
export const EARLY_BUDGET_SHARE = 0.8

/**
 * A window setting such as "240-360", or the fallback when it is missing or
 * malformed (non-numeric, negative, or hi not above lo).
 */
export function parseWindow(raw: string | undefined | null, fallback: WindowBounds): WindowBounds {
  const match = /^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*$/.exec(raw ?? "")
  if (!match) return fallback
  const lo = Number(match[1])
  const hi = Number(match[2])
  return Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? { lo, hi } : fallback
}

/** Which window an event this many minutes from its start is in, if any. */
export function windowFor(minsToStart: number, windows: PropsWindows): PropsWindowName | null {
  const inside = (w: WindowBounds) => minsToStart > w.lo && minsToStart <= w.hi
  // Late first: if a misconfiguration makes the windows overlap, the fetch
  // closer to the start is the one worth having.
  if (inside(windows.late)) return "late"
  if (inside(windows.early)) return "early"
  return null
}

export interface DueEvent<E> {
  event: E
  window: PropsWindowName
  minsToStart: number
}

/**
 * The events to fetch on this tick: not started, inside a window, soonest
 * first, so late-window fetches come before early ones when the budget is
 * short.
 */
export function duePropsEvents<E extends { commenceTime: Date }>(
  events: E[],
  now: Date,
  windows: PropsWindows
): DueEvent<E>[] {
  const due: DueEvent<E>[] = []
  for (const event of events) {
    const minsToStart = (event.commenceTime.getTime() - now.getTime()) / 60_000
    if (!(minsToStart > 0)) continue
    const window = windowFor(minsToStart, windows)
    if (window) due.push({ event, window, minsToStart })
  }
  return due.sort((a, b) => a.minsToStart - b.minsToStart)
}

/**
 * Whether a fetch estimated at `estimate` credits fits the month's cap after
 * `spent`. Early-window fetches stop at EARLY_BUDGET_SHARE of the cap, so the
 * last part of the budget is kept for late-window fetches, whose prices are
 * the fresher ones.
 */
export function budgetAllows(args: { spent: number; estimate: number; cap: number; window: PropsWindowName }): boolean {
  const limit = args.window === "early" ? args.cap * EARLY_BUDGET_SHARE : args.cap
  return args.spent + args.estimate <= limit
}

/** 00:00 UTC on the first day of now's month: when the monthly cap resets. */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/** Settings that leave a gap a scheduled tick can fall through, as warnings for the boot log. */
export function windowWarnings(windows: PropsWindows, intervalMin: number): string[] {
  const warnings: string[] = []
  for (const name of ["early", "late"] as const) {
    const w = windows[name]
    if (w.hi - w.lo < intervalMin) {
      warnings.push(
        `The ${name} props window (${w.lo}-${w.hi} min) is narrower than PROPS_INTERVAL_MIN (${intervalMin}), ` +
          "so some events will be missed in it"
      )
    }
  }
  if (windows.late.hi > windows.early.lo && windows.early.hi > windows.late.lo) {
    warnings.push("The early and late props windows overlap; events in the overlap are fetched as late")
  }
  return warnings
}
