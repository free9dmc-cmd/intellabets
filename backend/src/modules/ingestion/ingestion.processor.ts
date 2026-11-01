import { Processor, Process } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import type { Job } from "bull"
import { PredictionsService } from "../predictions/predictions.service"
import { OddsApiError } from "./odds-aggregator.service"
import { PropsIngestService } from "./props-ingest.service"

export const INGESTION_QUEUE = "ingestion"
/**
 * Props run on their own queue with one worker. On the shared queue Bull adds
 * every named processor's concurrency together, so props jobs waiting on each
 * other would hold the workers the game-line polls need.
 */
export const PROPS_QUEUE = "props"

interface PollJob { sportKey: string }
interface SettleJob { sportKey: string }
interface PropsJob { sportKey: string }

@Processor(INGESTION_QUEUE)
export class IngestionProcessor {
  private readonly logger = new Logger(IngestionProcessor.name)

  constructor(private readonly predictions: PredictionsService) {}

  @Process({ name: "poll", concurrency: 2 })
  async handlePoll(job: Job<PollJob>) {
    const { sportKey } = job.data
    this.logger.debug(`Polling odds for ${sportKey}`)
    try {
      return await this.predictions.ingestAndPredict(sportKey)
    } catch (err) {
      await this.failJob(job, `Poll failed for ${sportKey}`, err)
    }
  }

  @Process({ name: "settle", concurrency: 2 })
  async handleSettle(job: Job<SettleJob>) {
    const { sportKey } = job.data
    this.logger.debug(`Settling ${sportKey}`)
    try {
      return await this.predictions.settleSport(sportKey)
    } catch (err) {
      await this.failJob(job, `Settle failed for ${sportKey}`, err)
    }
  }

  private failJob(job: Job, label: string, err: unknown): Promise<never> {
    return failJob(this.logger, job, label, err)
  }
}

@Processor(PROPS_QUEUE)
export class PropsProcessor {
  private readonly logger = new Logger(PropsProcessor.name)

  constructor(private readonly propsIngest: PropsIngestService) {}

  // The only processor on its queue, so one props run at a time: two sports
  // cannot both pass the monthly cap check on the same credits.
  @Process({ name: "props", concurrency: 1 })
  async handleProps(job: Job<PropsJob>) {
    const { sportKey } = job.data
    this.logger.debug(`Fetching props for ${sportKey}`)
    try {
      return await this.propsIngest.run(sportKey)
    } catch (err) {
      await failJob(this.logger, job, `Props failed for ${sportKey}`, err)
    }
  }
}

/**
 * Log the failure and rethrow so Bull marks the job failed. A rejected key or
 * an exhausted quota is not retried: the retries would fail the same way.
 */
async function failJob(logger: Logger, job: Job, label: string, err: unknown): Promise<never> {
  const msg = err instanceof Error ? err.message : String(err)
  if (err instanceof OddsApiError && err.isAuthFailure) {
    logger.error(`${label}: ${msg} — not retrying; check THE_ODDS_API_KEY and the plan's credits`)
    await job.discard()
  } else {
    logger.error(`${label}: ${msg}`)
  }
  throw err
}
