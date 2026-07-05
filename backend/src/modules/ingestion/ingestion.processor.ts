import { Processor, Process } from "@nestjs/bull"
import { Logger } from "@nestjs/common"
import type { Job } from "bull"
import { PredictionsService } from "../predictions/predictions.service"

export const INGESTION_QUEUE = "ingestion"

interface PollJob { sportKey: string }
interface SettleJob { sportKey: string }

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
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Poll failed for ${sportKey}: ${msg}`)
      throw err // let Bull retry with backoff
    }
  }

  @Process({ name: "settle", concurrency: 2 })
  async handleSettle(job: Job<SettleJob>) {
    const { sportKey } = job.data
    this.logger.debug(`Settling ${sportKey}`)
    try {
      return await this.predictions.settleSport(sportKey)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`Settle failed for ${sportKey}: ${msg}`)
      throw err
    }
  }
}
