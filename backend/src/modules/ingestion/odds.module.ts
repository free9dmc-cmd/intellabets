import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { OddsAggregatorService } from "./odds-aggregator.service"

/**
 * Standalone module for the multi-book odds source, so both PredictionsModule
 * and IngestionModule can depend on it without a circular import.
 */
@Module({
  imports: [ConfigModule],
  providers: [OddsAggregatorService],
  exports: [OddsAggregatorService],
})
export class OddsModule {}
