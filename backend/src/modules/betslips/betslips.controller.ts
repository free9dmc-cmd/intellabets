import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from "@nestjs/swagger"
import { BetslipsService } from "./betslips.service"
import { CreateBetslipDto, GenerateBetslipDto } from "./dto/betslip.dto"
import { JwtAuthGuard, RolesGuard } from "../auth/guards/jwt-auth.guard"
import { CurrentUser, RequirePremium } from "../auth/decorators/current-user.decorator"
import type { AuthenticatedUser } from "../auth/jwt.strategy"

@ApiTags("betslips")
@Controller("betslips")
export class BetslipsController {
  constructor(private readonly betslips: BetslipsService) {}

  @Get()
  @ApiOperation({ summary: "Public marketplace feed of published betslips" })
  @ApiQuery({ name: "sport", required: false })
  listPublic(@Query("sport") sport?: string, @Query("limit") limit?: string) {
    return this.betslips.listPublic(sport, limit ? parseInt(limit, 10) : 30)
  }

  @Get("mine")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "My betslips" })
  mine(@CurrentUser("id") userId: string) {
    return this.betslips.listByUser(userId)
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a single betslip" })
  getOne(@Param("id") id: string) {
    return this.betslips.getOne(id)
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePremium()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a betslip manually (premium tipsters)" })
  create(@CurrentUser("id") userId: string, @Body() dto: CreateBetslipDto) {
    return this.betslips.create(userId, dto)
  }

  @Post("generate")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePremium()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Auto-generate a betslip from top +EV engine predictions" })
  generate(@CurrentUser() user: AuthenticatedUser, @Body() dto: GenerateBetslipDto) {
    return this.betslips.generateFromPredictions(user.id, dto)
  }

  @Post("live-parlay")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePremium()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Build a LIVE in-game parlay from current +EV legs (game markets + props)" })
  liveParlay(@CurrentUser() user: AuthenticatedUser, @Body() dto: GenerateBetslipDto) {
    return this.betslips.buildLiveParlay(user.id, {
      sport: dto.sport,
      legCount: dto.legCount,
      minConfidence: dto.minConfidence,
      stake: dto.stake,
      publish: dto.publish,
    })
  }

  @Post(":id/publish")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePremium()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Publish a betslip to the marketplace" })
  publish(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.betslips.publish(userId, id)
  }
}
