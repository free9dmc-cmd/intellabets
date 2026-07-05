import { Controller, Get, Query, UseGuards } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from "@nestjs/swagger"
import { PredictionsService } from "./predictions.service"
import { JwtAuthGuard, RolesGuard } from "../auth/guards/jwt-auth.guard"
import { RequirePremium } from "../auth/decorators/current-user.decorator"

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

  @Get("performance")
  @ApiOperation({ summary: "Honest rolling scoreboard: win rate + average CLV" })
  performance() {
    return this.predictions.performance()
  }
}
