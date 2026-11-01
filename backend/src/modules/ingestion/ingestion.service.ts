import { Injectable, Logger, OnModuleInit } from "@nestjs/common"
import { InjectQueue } from "@nestjs/bull"
import type { Queue } from "bull"
import { ConfigService } from "@nestjs/config"
import { OddsAggregatorService } from "./odds-aggregator.service"
import { INGESTION_QUEUE, PROPS_QUEUE } from "./ingestion.processor"
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
    @InjectQueue(PROPS_QUEUE) private readonly propsQueue: Queue,
    private readonly aggregator: OddsAggregatorService,
    private readonly config: ConfigService,
    private readonly propsIngest: PropsIngestService
  ) {}

  async onModuleInit() {
    // Clear the previous boot's schedule first, so turning ingestion off (or
    // a sport out of the lists) takes effect at this restart.
    await this.clearSchedule(this.queue)
    await this.clearSchedule(this.propsQueue)

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

    for (const sportKey of this.aggregator.activeSportKeys()) {
      await this.queue.add(
        "poll",
        { sportKey },
        {
          repeat: { every: pollMin * 60_000 },
          jobId: `poll-${sportKey}`,
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
          jobId: `settle-${sportKey}`,
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
    // removed their schedule.
    const propsSports = this.aggregator.propsSportKeys()
    if (propsSports.length === 0) return
    const propsMin = this.propsIngest.intervalMin()
    for (const sportKey of propsSports) {
      await this.propsQueue.add(
        "props",
        { sportKey },
        {
          repeat: { every: propsMin * 60_000 },
          jobId: `props-${sportKey}`,
          removeOnComplete: 20,
          removeOnFail: 20,
          attempts: 1,
        }
      )
    }
    this.logger.log(`Scheduled props every ${propsMin}m for ${propsSports.join(", ")}`)
    for (const warning of windowWarnings(this.propsIngest.windows(), propsMin)) this.logger.warn(warning)
  }

  /**
   * Remove a queue's repeatable jobs and the runs they already queued. Bull
   * leaves the next run of a removed repeatable in place (always when its job
   * id contains ":"), so without this a paused job still runs once more.
   */
  private async clearSchedule(queue: Queue): Promise<void> {
    const repeatables = await queue.getRepeatableJobs()
    await Promise.all(repeatables.map((j) => queue.removeRepeatableByKey(j.key)))
    const delayed = await queue.getDelayed()
    await Promise.all(delayed.map((j) => j.remove().catch(() => undefined)))
  }

  /** Manually trigger a one-off poll (used by the admin endpoint). */
  async triggerPoll(sportKey: string) {
    await this.queue.add("poll", { sportKey }, { removeOnComplete: true })
  }

  async triggerSettle(sportKey: string) {
    await this.queue.add("settle", { sportKey }, { removeOnComplete: true })
  }
}
