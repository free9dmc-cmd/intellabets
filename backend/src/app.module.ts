import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { BullModule } from "@nestjs/bull"
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler"
import { APP_GUARD } from "@nestjs/core"
import { PrismaModule } from "./common/prisma/prisma.module"
import { AuthModule } from "./modules/auth/auth.module"
import { SportsbookModule } from "./modules/sportsbook/sportsbook.module"
import { PredictionsModule } from "./modules/predictions/predictions.module"
import { IngestionModule } from "./modules/ingestion/ingestion.module"

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),

    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>("REDIS_URL") ?? "redis://localhost:6379"
        return { redis: url }
      },
    }),

    PrismaModule,
    AuthModule,
    SportsbookModule,
    PredictionsModule,
    IngestionModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
