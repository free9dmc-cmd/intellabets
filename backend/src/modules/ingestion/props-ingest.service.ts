import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { PrismaService } from "../../common/prisma/prisma.service"
import { PredictionsService } from "../predictions/predictions.service"
import { OddsAggregatorService, OddsApiError } from "./odds-aggregator.service"
import {
  DEFAULT_PROPS_WINDOWS,
  EARLY_BUDGET_SHARE,
  budgetAllows,
  duePropsEvents,
  monthStartUtc,
  parseWindow,
  type PropsWindows,
} from "./props-schedule"

export interface PropsRunResult {
  /** Events in the sport's listing. */
  listed: number
  /** Event calls that were charged or returned lines. */
  fetched: number
  early: number
  late: number
  /** Due events not fetched because of the monthly cap or the remaining-credits floor. */
  skipped: number
  /** Credits this run spent (the estimate for a call that failed). */
  credits: number
}

/**
 * The scheduled player-props job: fetches each event's props at most once in
 * an early window and once in a late window before it starts, and stores them
 * as an odds snapshot for the props board. It creates no engine picks.
 *
 * Every event call costs (markets x regions) credits, so each one is recorded
 * in the PropsFetch ledger. The ledger is the once-per-window dedupe (a unique
 * slot per event and window), the monthly cap (PROPS_CREDIT_CAP_MONTH) and,
 * with the last x-requests-remaining seen, the floor that keeps credits for
 * game lines (PROPS_MIN_REMAINING_CREDITS). It lives in Postgres because the
 * Redis instance has no persistence: a restart must not reset the month.
 */
@Injectable()
export class PropsIngestService {
  private readonly logger = new Logger(PropsIngestService.name)
  /** The run in progress; runs queue behind it (see run()). */
  private running: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregator: OddsAggregatorService,
    private readonly predictions: PredictionsService,
    private readonly config: ConfigService
  ) {}

  /** The early and late windows, (lo, hi] minutes before the start. */
  windows(): PropsWindows {
    return {
      early: parseWindow(this.config.get<string>("PROPS_EARLY_WINDOW_MIN"), DEFAULT_PROPS_WINDOWS.early),
      late: parseWindow(this.config.get<string>("PROPS_LATE_WINDOW_MIN"), DEFAULT_PROPS_WINDOWS.late),
    }
  }

  /** Minutes between scheduled runs. */
  intervalMin(): number {
    return this.numberSetting("PROPS_INTERVAL_MIN", 30, 1)
  }

  /** Credits props may spend per UTC calendar month. */
  creditCap(): number {
    return this.numberSetting("PROPS_CREDIT_CAP_MONTH", 3500)
  }

  private minRemainingCredits(): number {
    return this.numberSetting("PROPS_MIN_REMAINING_CREDITS", 1000)
  }

  private retentionDays(): number {
    return this.numberSetting("PROPS_SNAPSHOT_RETENTION_DAYS", 2)
  }

  private numberSetting(key: string, fallback: number, min = 0): number {
    const raw = this.config.get<string | number>(key)
    if (raw == null || String(raw).trim() === "") return fallback
    const n = Number(raw)
    return Number.isFinite(n) && n >= min ? n : fallback
  }

  /**
   * One scheduled run for a sport. Auth failures (rejected key, no credits)
   * are rethrown. Runs go one at a time, so two sports cannot both pass the
   * cap check on the same credits: Bull adds the concurrency of every named
   * processor on the queue together, so its "props" concurrency of 1 does not
   * ensure that, and the jobs for all sports fire on the same tick.
   */
  run(sportKey: string, now?: Date): Promise<PropsRunResult> {
    const next = this.running.then(() => this.runOnce(sportKey, now ?? new Date()))
    this.running = next.catch(() => undefined)
    return next
  }

  private async runOnce(sportKey: string, now: Date): Promise<PropsRunResult> {
    const result: PropsRunResult = { listed: 0, fetched: 0, early: 0, late: 0, skipped: 0, credits: 0 }
    if (!this.aggregator.isConfigured()) return result
    const markets = this.aggregator.propMarketsFor(sportKey)
    if (markets.length === 0) return result

    const listing = await this.aggregator.fetchEvents(sportKey)
    result.listed = listing.events.length
    if (listing.cost != null && listing.cost > 0) {
      // The listing has been free; if that changes, every tick costs credits.
      this.logger.error(
        `${sportKey} PROPS: the events listing cost ${listing.cost} credits and is no longer free. ` +
          `It now counts toward PROPS_CREDIT_CAP_MONTH; consider raising PROPS_INTERVAL_MIN to 60`
      )
      await this.prisma.propsFetch.create({ data: { sportKey, kind: "listing", cost: listing.cost } })
      result.credits += listing.cost
    }

    const cap = this.creditCap()
    const floor = this.minRemainingCredits()
    const estimate = markets.length * this.aggregator.propsRegions().split(",").length
    const monthStart = monthStartUtc(now)
    let remaining = listing.remaining ?? this.aggregator.status().quota?.remaining ?? null
    const warned = new Set<string>()
    const warnOnce = (reason: string, message: string) => {
      if (warned.has(reason)) return
      warned.add(reason)
      this.logger.warn(message)
    }

    for (const { event, window } of duePropsEvents(listing.events, now, this.windows())) {
      const slot = `${event.id}:${window}`
      const taken = await this.prisma.propsFetch.findUnique({ where: { slot }, select: { id: true } })
      if (taken) continue

      const spent = await this.spentSince(monthStart)
      if (!budgetAllows({ spent, estimate, cap, window })) {
        result.skipped++
        warnOnce(
          `cap:${window}`,
          `${sportKey} PROPS: skipping ${window}-window fetches: ${spent} credits spent this month, and ${estimate} more ` +
            `would pass ${window === "early" ? `${EARLY_BUDGET_SHARE * 100}% of ` : ""}PROPS_CREDIT_CAP_MONTH (${cap})`
        )
        continue
      }
      if (remaining != null && remaining - estimate < floor) {
        result.skipped++
        warnOnce(
          "floor",
          `${sportKey} PROPS: stopping: ${remaining} Odds API credits left, a call costs up to ${estimate}, ` +
            `and PROPS_MIN_REMAINING_CREDITS keeps ${floor} for game lines`
        )
        break
      }

      // Claim the slot before calling, at the estimate, so no other run can
      // fetch it too and the spend counts even if this process dies mid-call.
      try {
        await this.prisma.propsFetch.create({ data: { sportKey, eventId: event.id, slot, kind: "event", cost: estimate } })
      } catch (err) {
        if (isUniqueViolation(err)) continue
        throw err
      }

      let fetched: Awaited<ReturnType<OddsAggregatorService["fetchEventProps"]>>
      try {
        fetched = await this.aggregator.fetchEventProps(sportKey, event.id)
      } catch (err) {
        // The claim stays at the estimate: the call may have been charged.
        result.credits += estimate
        if (err instanceof OddsApiError && err.isAuthFailure) throw err
        this.logger.warn(
          `${sportKey} PROPS: ${event.awayTeam} @ ${event.homeTeam} (${window}) failed: ${err instanceof Error ? err.message : String(err)}`
        )
        continue
      }
      if (fetched.remaining != null) remaining = fetched.remaining

      const lines = fetched.books?.booksByMarket.size ?? 0
      if (fetched.cost === 0 && lines === 0) {
        // Nothing posted yet, and an empty answer is free: release the slot so
        // the next tick inside this window asks again.
        await this.prisma.propsFetch.delete({ where: { slot } })
        continue
      }
      const cost = fetched.cost ?? estimate
      await this.prisma.propsFetch.update({ where: { slot }, data: { cost, markets: lines } })
      result.fetched++
      result[window]++
      result.credits += cost

      if (fetched.books && lines > 0) {
        try {
          await this.predictions.savePropsSnapshot(fetched.books)
        } catch (err) {
          this.logger.error(
            `${sportKey} PROPS: could not save ${event.awayTeam} @ ${event.homeTeam}: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }
    }

    await this.pruneSnapshots(sportKey, now)

    const month = await this.spentSince(monthStart)
    const summary =
      `${sportKey} PROPS: fetched ${result.fetched} (early ${result.early}, late ${result.late}), ` +
      `skipped ${result.skipped}, credits ${result.credits}, month ${month}/${cap}`
    if (result.fetched || result.skipped || result.credits) this.logger.log(summary)
    else this.logger.debug(summary)
    return result
  }

  /** Props job state for /ingestion/status. */
  async status(now = new Date()): Promise<{
    sports: string[]
    creditsThisMonth: number
    cap: number
    lastFetchAt: string | null
  }> {
    const [creditsThisMonth, last] = await Promise.all([
      this.spentSince(monthStartUtc(now)),
      this.prisma.propsFetch.findFirst({ orderBy: { fetchedAt: "desc" }, select: { fetchedAt: true } }),
    ])
    return {
      sports: this.aggregator.propsSportKeys(),
      creditsThisMonth,
      cap: this.creditCap(),
      lastFetchAt: last?.fetchedAt.toISOString() ?? null,
    }
  }

  /** Credits the ledger records since `since` (every kind: event, listing, manual). */
  private async spentSince(since: Date): Promise<number> {
    const agg = await this.prisma.propsFetch.aggregate({ _sum: { cost: true }, where: { fetchedAt: { gte: since } } })
    return agg._sum.cost ?? 0
  }

  /**
   * Delete a sport's props snapshots once their game started more than
   * PROPS_SNAPSHOT_RETENTION_DAYS ago. Each is a few hundred KB and nothing
   * reads them after the game (grading uses box scores, CLV uses game lines).
   * Game-line snapshots are never touched.
   */
  private async pruneSnapshots(sportKey: string, now: Date): Promise<void> {
    const sport = this.aggregator.sportFor(sportKey)
    if (!sport) return
    const cutoff = new Date(now.getTime() - this.retentionDays() * 86_400_000)
    const deleted = await this.prisma.$executeRaw`
      DELETE FROM "OddsSnapshot" s USING "Game" g
      WHERE s."gameId" = g.id
        AND g.sport = ${sport}
        AND g."commenceTime" < ${utcTimestamp(cutoff)}::timestamp
        AND (CASE WHEN jsonb_typeof(s.markets) = 'object'
          THEN EXISTS (SELECT 1 FROM jsonb_object_keys(s.markets) k WHERE strpos(k, '|') > 0)
          ELSE false END)`
    if (deleted > 0) {
      this.logger.log(`${sportKey} PROPS: deleted ${deleted} props snapshots of games that started before ${cutoff.toISOString()}`)
    }
  }
}

/** Prisma's unique-constraint violation: another run claimed the slot first. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002"
}

/**
 * A Date as the text of a UTC timestamp, for comparing with a Prisma DateTime
 * column (timestamp without time zone, stored in UTC) in raw SQL whatever the
 * session's time zone.
 */
function utcTimestamp(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", "")
}
