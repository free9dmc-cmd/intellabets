import { Module } from "@nestjs/common"
import { BetslipsService } from "./betslips.service"
import { BetslipsController } from "./betslips.controller"
import { PredictionsModule } from "../predictions/predictions.module"

@Module({
  imports: [PredictionsModule], // for AIAnalystService
  controllers: [BetslipsController],
  providers: [BetslipsService],
  exports: [BetslipsService],
})
export class BetslipsModule {}
