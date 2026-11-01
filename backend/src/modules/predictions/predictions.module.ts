import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { PredictionEngineService } from "./prediction-engine.service"
import { AIAnalystService } from "./ai-analyst.service"
import { PredictionsService } from "./predictions.service"
import { PredictionsController } from "./predictions.controller"
import { MlbStatsService } from "./mlb-stats.service"
import { NhlStatsService } from "./nhl-stats.service"
import { NhlPropsGrader } from "./nhl-props.grader"
import { OddsModule } from "../ingestion/odds.module"

@Module({
  imports: [ConfigModule, OddsModule],
  controllers: [PredictionsController],
  providers: [PredictionEngineService, AIAnalystService, PredictionsService, MlbStatsService, NhlStatsService, NhlPropsGrader],
  exports: [PredictionsService, PredictionEngineService, AIAnalystService],
})
export class PredictionsModule {}
