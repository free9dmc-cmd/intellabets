import { BadRequestException, Controller, Get, NotFoundException, Param, Query, UseGuards } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from "@nestjs/swagger"
import { MAX_BETSLIP_LEGS, PredictionsService } from "./predictions.service"
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

  @Get("board")
  @UseGuards(ServiceOrPremiumGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Every upcoming bet licensed books price in a sport, best value first, with honest win chance and edge (often negative)",
  })
  @ApiQuery({ name: "sport", required: true, description: "e.g. NFL, NCAAF, NBA, NHL, MLB" })
  @ApiQuery({ name: "book", required: false, description: "Only bets this book prices, at its price" })
  @ApiQuery({ name: "limit", required: false, description: "Default 60, at most 200" })
  board(@Query("sport") sport: string, @Query("book") book?: string, @Query("limit") limit?: string) {
    if (!sport) throw new BadRequestException("sport is required")
    const n = limit ? parseInt(limit, 10) : undefined
    return this.predictions.board({ sport, book: book ?? null, limit: Number.isFinite(n) ? n : undefined })
  }

  @Get("betslip")
  @UseGuards(ServiceOrPremiumGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Several picks priced at one sportsbook, with a betslip link per leg (and one parlay link where the book supports it)",
  })
  @ApiQuery({ name: "ids", required: false, description: "Comma-separated prediction ids" })
  @ApiQuery({ name: "refs", required: false, description: "Comma-separated board refs (gameId~outcomeId)" })
  @ApiQuery({ name: "book", required: false, description: "Your sportsbook, e.g. fanduel or caesars" })
  @ApiQuery({ name: "state", required: false, description: "Your 2-letter US state, e.g. NJ" })
  @ApiQuery({ name: "stake", required: false, description: "Stake in USD for the parlay payout (default 10)" })
  betslip(
    @Query("ids") ids?: string,
    @Query("refs") refs?: string,
    @Query("book") book?: string,
    @Query("state") state?: string,
    @Query("stake") stake?: string
  ) {
    const idList = (ids ?? "").split(",").map((s) => s.trim()).filter(Boolean)
    // Refs carry team names and Over/Under, never commas, so both split on ",".
    const refList = (refs ?? "").split(",").map((s) => s.trim()).filter(Boolean)
    if (idList.length + refList.length === 0) throw new BadRequestException("ids or refs is required")
    if (idList.length + refList.length > MAX_BETSLIP_LEGS) {
      throw new BadRequestException(`At most ${MAX_BETSLIP_LEGS} legs per betslip`)
    }
    const parsed = stake ? Number(stake) : undefined
    return this.predictions.betslipFor(idList, {
      refs: refList,
      book: book ?? null,
      state: state ?? null,
      stake: parsed !== undefined && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
    })
  }

  @Get("results")
  @UseGuards(ServiceOrPremiumGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Settlement results for a set of prediction ids (comma-separated)" })
  @ApiQuery({ name: "ids", required: true })
  results(@Query("ids") ids: string) {
    const list = (ids ?? "").split(",").map((s) => s.trim()).filter(Boolean)
    return this.predictions.resultsFor(list)
  }

  @Get(":id/books")
  @UseGuards(ServiceOrPremiumGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Every sportsbook's current price for this pick, ranked by payout",
  })
  @ApiQuery({ name: "stake", required: false, description: "Stake in USD (default 100)" })
  @ApiQuery({ name: "preferred", required: false, description: "Your usual book, e.g. fanduel" })
  @ApiQuery({
    name: "state",
    required: false,
    description: "Your 2-letter US state, e.g. NJ. Lets state-hosted books (BetMGM, Caesars, BetRivers) open a filled betslip",
  })
  async books(
    @Param("id") id: string,
    @Query("stake") stake?: string,
    @Query("preferred") preferred?: string,
    @Query("state") state?: string
  ) {
    const parsed = stake ? Number(stake) : 100
    const amount = Number.isFinite(parsed) && parsed > 0 ? parsed : 100
    // Invalid state codes are ignored by the link builder (normalizeState).
    const result = await this.predictions.compareBooksFor(id, amount, preferred ?? null, state ?? null)
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
