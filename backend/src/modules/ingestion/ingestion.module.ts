import { Module } from "@nestjs/common"
import { BullModule } from "@nestjs/bull"
import { ConfigModule } from "@nestjs/config"
import { IngestionProcessor, INGESTION_QUEUE } from "./ingestion.processor"
import { IngestionService } from "./ingestion.service"
import { IngestionController } from "./ingestion.controller"
import { OddsModule } from "./odds.module"
import { PredictionsModule } from "../predictions/predictions.module"

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({ name: INGESTION_QUEUE }),
    OddsModule,
    PredictionsModule,
  ],
  controllers: [IngestionController],
  providers: [IngestionProcessor, IngestionService],
  exports: [IngestionService],
})
export class IngestionModule {}
