import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { BullModule } from "@nestjs/bull"
import { ThrottlerModule } from "@nestjs/throttler"
import { AuthModule } from "./modules/auth/auth.module"
import { UsersModule } from "./modules/users/users.module"
import { BetslipsModule } from "./modules/betslips/betslips.module"
import { SubscriptionsModule } from "./modules/subscriptions/subscriptions.module"
import { AIPicksModule } from "./modules/ai-picks/ai-picks.module"
import { SportsbookModule } from "./modules/sportsbook/sportsbook.module"
import { WebhooksModule } from "./modules/webhooks/webhooks.module"
import { PrismaModule } from "./common/prisma/prisma.module"

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),

    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: config.get("REDIS_URL"),
      }),
    }),

    PrismaModule,
    AuthModule,
    UsersModule,
    BetslipsModule,
    SubscriptionsModule,
    AIPicksModule,
    SportsbookModule,
    WebhooksModule,
  ],
})
export class AppModule {}
