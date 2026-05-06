import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { MockProvider } from "./providers/mock.provider"
import { DraftKingsProvider } from "./providers/draftkings.provider"
import { ProviderRegistry } from "./registry/provider.registry"

@Module({
  imports: [ConfigModule],
  providers: [MockProvider, DraftKingsProvider, ProviderRegistry],
  exports: [ProviderRegistry],
})
export class SportsbookModule {}
