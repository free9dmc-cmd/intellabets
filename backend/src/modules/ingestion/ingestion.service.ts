import { Injectable, Logger, OnModuleInit } from "@nestjs/common"
import { InjectQueue } from "@nestjs/bull"
import type { Queue } from "bull"
import { ConfigService } from "@nestjs/config"
import { OddsAggregatorService } from "./odds-aggregator.service"
import { INGESTION_QUEUE } from "./ingestion.processor"
import { PropsIngestService } from "./props-ingest.service"
import { windowWarnings } from "./props-schedule"

/**
 * Schedules repeatable odds-polling and settlement jobs.
 *
 * Polling cadence is deliberately conservative to respect The Odds API quota;
 * tune POLL_INTERVAL_MIN per your plan. Closing-line capture happens naturally
 * because the poll marks the snapshot within 10 min of kickoff as "closing".
 *
 * Player props have their own job per PROPS_SPORTS sport (see
 * PropsIngestService), with a single attempt: a Bull retry must never spend
 * credits again, and the next tick is the retry.
 */
@Injectable()
export class IngestionService implements OnModuleInit {
  private readonly logger = new Logger(IngestionService.name)

  constructor(
    @InjectQueue(INGESTION_QUEUE) private readonly queue: Queue,
    private readonly aggregator: OddsAggregatorService,
    private readonly config: ConfigService,
    private readonly propsIngest: PropsIngestService
  ) {}

  async onModuleInit() {
    if (!this.aggregator.isConfigured()) {
      this.logger.warn("THE_ODDS_API_KEY not set — ingestion scheduler idle")
      return
    }
    if (this.config.get("DISABLE_INGESTION") === "true") {
      this.logger.warn("DISABLE_INGESTION=true — scheduler idle")
      return
    }

    const pollMin = Number(this.config.get("POLL_INTERVAL_MIN") ?? 30)
    const settleMin = Number(this.config.get("SETTLE_INTERVAL_MIN") ?? 60)

    // Clear any stale repeatables from a previous boot, then reschedule.
    const existing = await this.queue.getRepeatableJobs()
    await Promise.all(existing.map((j) => this.queue.removeRepeatableByKey(j.key)))

    for (const sportKey of this.aggregator.activeSportKeys()) {
      await this.queue.add(
        "poll",
        { sportKey },
        {
          repeat: { every: pollMin * 60_000 },
          jobId: `poll:${sportKey}`,
          removeOnComplete: 20,
          removeOnFail: 20,
          attempts: 3,
          backoff: { type: "exponential", delay: 5_000 },
        }
      )
      await this.queue.add(
        "settle",
        { sportKey },
        {
          repeat: { every: settleMin * 60_000 },
          jobId: `settle:${sportKey}`,
          removeOnComplete: 20,
          removeOnFail: 20,
          attempts: 3,
          backoff: { type: "exponential", delay: 10_000 },
        }
      )
    }

    this.logger.log(
      `Scheduled polling every ${pollMin}m and settlement every ${settleMin}m for ${this.aggregator.activeSportKeys().length} sports`
    )

    // Emptying PROPS_SPORTS turns props off: the clean-up above already
    // removed their repeatables.
    const propsSports = this.aggregator.propsSportKeys()
    if (propsSports.length === 0) return
    const propsMin = this.propsIngest.intervalMin()
    for (const sportKey of propsSports) {
      await this.queue.add(
        "props",
        { sportKey },
        {
          repeat: { every: propsMin * 60_000 },
          jobId: `props:${sportKey}`,
          removeOnComplete: 20,
          removeOnFail: 20,
          attempts: 1,
        }
      )
    }
    this.logger.log(`Scheduled props every ${propsMin}m for ${propsSports.join(", ")}`)
    for (const warning of windowWarnings(this.propsIngest.windows(), propsMin)) this.logger.warn(warning)
  }

  /** Manually trigger a one-off poll (used by the admin endpoint). */
  async triggerPoll(sportKey: string) {
    await this.queue.add("poll", { sportKey }, { removeOnComplete: true })
  }

  async triggerSettle(sportKey: string) {
    await this.queue.add("settle", { sportKey }, { removeOnComplete: true })
  }
}
