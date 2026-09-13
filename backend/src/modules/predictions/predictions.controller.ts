import { Controller, Get, NotFoundException, Param, Query, UseGuards } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from "@nestjs/swagger"
import { PredictionsService } from "./predictions.service"
import { JwtAuthGuard, RolesGuard } from "../auth/guards/jwt-auth.guard"
import { ServiceOrPremiumGuard } from "../auth/guards/service-or-premium.guard"
import { RequirePremium } from "../auth/decorators/current-user.decorator"
import { STRATEGIES, isStrategyKey } from "./strategies"

@ApiTags("predictions")
@Controller("predictions")
export class PredictionsController {
  constructor(private readonly predictions: PredictionsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePremium()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current +EV house predictions (premium only)" })
  @ApiQuery({ name: "sport", required: false })
  @ApiQuery({ name: "limit", required: false })
  list(@Query("sport") sport?: string, @Query("limit") limit?: string) {
    return this.predictions.listPending(sport, limit ? parseInt(limit, 10) : 50)
  }

  @Get("strategies")
  @ApiOperation({ summary: "List available betting strategies and what each one does" })
  strategies() {
    return { strategies: Object.values(STRATEGIES) }
  }

  @Get("strategy/:key")
  @UseGuards(ServiceOrPremiumGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Picks for one strategy (value | steam | contrarian | safe | longshot)",
  })
  @ApiQuery({ name: "sport", required: false })
  @ApiQuery({ name: "limit", required: false })
  byStrategy(
    @Param("key") key: string,
    @Query("sport") sport?: string,
    @Query("limit") limit?: string
  ) {
    if (!isStrategyKey(key)) {
      throw new NotFoundException(
        `Unknown strategy "${key}". Available: ${Object.keys(STRATEGIES).join(", ")}`
      )
    }
    return this.predictions.listByStrategy(key, sport, limit ? parseInt(limit, 10) : 25)
  }

  @Get(":id/books")
  @UseGuards(ServiceOrPremiumGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Every sportsbook's current price for this pick, ranked by payout",
  })
  @ApiQuery({ name: "stake", required: false, description: "Stake in USD (default 100)" })
  @ApiQuery({ name: "preferred", required: false, description: "Your usual book, e.g. fanduel" })
  async books(
    @Param("id") id: string,
    @Query("stake") stake?: string,
    @Query("preferred") preferred?: string
  ) {
    const parsed = stake ? Number(stake) : 100
    const amount = Number.isFinite(parsed) && parsed > 0 ? parsed : 100
    const result = await this.predictions.compareBooksFor(id, amount, preferred ?? null)
    if (!result) throw new NotFoundException("Prediction not found")
    return result
  }

  @Get(":id/how-to-bet")
  @UseGuards(ServiceOrPremiumGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Step-by-step instructions for placing this bet yourself at the best-priced sportsbook",
  })
  @ApiQuery({
    name: "bankroll",
    required: false,
    description: "Your bankroll in USD, used to turn the stake % into a dollar figure (default 1000)",
  })
  async howToBet(@Param("id") id: string, @Query("bankroll") bankroll?: string) {
    const parsed = bankroll ? Number(bankroll) : undefined
    const guide = await this.predictions.placementGuide(
      id,
      Number.isFinite(parsed) && parsed! > 0 ? parsed : undefined
    )
    if (!guide) throw new NotFoundException("Prediction not found")
    return guide
  }

  @Get("performance")
  @ApiOperation({ summary: "Honest rolling scoreboard: win rate + average CLV" })
  performance() {
    return this.predictions.performance()
  }
}
