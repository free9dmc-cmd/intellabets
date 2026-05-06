import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { MockProvider } from "./providers/mock.provider"
import { DraftKingsProvider } from "./providers/draftkings.provider"
import { SportradarProvider } from "./providers/sportradar.provider"
import { ProviderRegistry } from "./registry/provider.registry"
import { ProviderConnector } from "./streaming/provider-connector"

const PROVIDER_CONNECTOR = "PROVIDER_CONNECTOR"

@Module({
  imports: [ConfigModule],
  providers: [
    MockProvider,
    DraftKingsProvider,
    SportradarProvider,
    ProviderRegistry,
    {
      provide: PROVIDER_CONNECTOR,
      inject: [SportradarProvider, MockProvider, ConfigService],
      useFactory: (primary: SportradarProvider, fallback: MockProvider, config: ConfigService) => {
        const latencyThresholdMs = config.get<number>("PROVIDER_LATENCY_THRESHOLD_MS", 3000)
        return new ProviderConnector(primary, fallback, { latencyThresholdMs })
      },
    },
  ],
  exports: [ProviderRegistry, PROVIDER_CONNECTOR],
})
export class SportsbookModule {}

export { PROVIDER_CONNECTOR }
