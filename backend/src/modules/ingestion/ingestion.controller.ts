import { Controller, Post, Query, UseGuards, BadRequestException } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from "@nestjs/swagger"
import { IngestionService } from "./ingestion.service"
import { OddsAggregatorService } from "./odds-aggregator.service"
import { PredictionsService } from "../predictions/predictions.service"
import { JwtAuthGuard, RolesGuard } from "../auth/guards/jwt-auth.guard"
import { RequireAdmin } from "../auth/decorators/current-user.decorator"

/**
 * Admin-only manual controls for the ingestion pipeline. Handy for testing:
 * trigger a poll on demand instead of waiting for the scheduler.
 */
@ApiTags("ingestion")
@Controller("ingestion")
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireAdmin()
@ApiBearerAuth()
export class IngestionController {
  constructor(
    private readonly ingestion: IngestionService,
    private readonly aggregator: OddsAggregatorService,
    private readonly predictions: PredictionsService
  ) {}

  @Post("poll")
  @ApiOperation({ summary: "Run ingestion + prediction for a sport RIGHT NOW (admin)" })
  @ApiQuery({ name: "sport", required: true, description: "e.g. baseball_mlb, americanfootball_nfl" })
  async pollNow(@Query("sport") sport: string) {
    if (!sport) throw new BadRequestException("sport query param required (e.g. baseball_mlb)")
    // Run inline so the response reports what happened, instead of queueing.
    const result = await this.predictions.ingestAndPredict(sport)
    return { sport, ...result, message: `Ingested ${result.games} games, generated ${result.predictions} predictions` }
  }

  @Post("live")
  @ApiOperation({ summary: "Ingest LIVE in-play game markets + predict now (admin)" })
  @ApiQuery({ name: "sport", required: true })
  async liveNow(@Query("sport") sport: string) {
    if (!sport) throw new BadRequestException("sport query param required")
    const result = await this.predictions.ingestLiveAndPredict(sport)
    return { sport, ...result, message: `Live: ${result.games} in-play games, ${result.predictions} predictions` }
  }

  @Post("props")
  @ApiOperation({ summary: "Ingest player props + predict now (admin). Costs 1 API credit per event." })
  @ApiQuery({ name: "sport", required: true })
  @ApiQuery({ name: "maxEvents", required: false, description: "Cap events to protect quota (default 5)" })
  async propsNow(@Query("sport") sport: string, @Query("maxEvents") maxEvents?: string) {
    if (!sport) throw new BadRequestException("sport query param required")
    const cap = maxEvents ? parseInt(maxEvents, 10) : 5
    const result = await this.predictions.ingestPropsAndPredict(sport, cap)
    return { sport, ...result, message: `Props: ${result.events} events, ${result.predictions} predictions` }
  }

  @Post("settle")
  @ApiOperation({ summary: "Settle finished games for a sport RIGHT NOW (admin)" })
  @ApiQuery({ name: "sport", required: true })
  async settleNow(@Query("sport") sport: string) {
    if (!sport) throw new BadRequestException("sport query param required")
    const result = await this.predictions.settleSport(sport)
    return { sport, ...result }
  }
}
