import { Module } from "@nestjs/common"
import { BullModule } from "@nestjs/bull"
import { ConfigModule } from "@nestjs/config"
import { IngestionProcessor, INGESTION_QUEUE } from "./ingestion.processor"
import { IngestionService } from "./ingestion.service"
import { PropsIngestService } from "./props-ingest.service"
import { IngestionController, IngestionStatusController } from "./ingestion.controller"
import { OddsModule } from "./odds.module"
import { PredictionsModule } from "../predictions/predictions.module"

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({ name: INGESTION_QUEUE }),
    OddsModule,
    PredictionsModule,
  ],
  controllers: [IngestionStatusController, IngestionController],
  providers: [IngestionProcessor, IngestionService, PropsIngestService],
  exports: [IngestionService, PropsIngestService],
})
export class IngestionModule {}
