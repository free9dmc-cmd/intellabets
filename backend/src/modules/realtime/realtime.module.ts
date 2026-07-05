import { Global, Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { RealtimeService } from "./realtime.service"

/**
 * Global so any module can inject RealtimeService without re-importing.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
