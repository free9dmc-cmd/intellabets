import { Injectable, Logger, OnModuleInit } from "@nestjs/common"
import type { ISportsbookProvider } from "../providers/provider.interface"
import { MockProvider } from "../providers/mock.provider"

@Injectable()
export class ProviderRegistry implements OnModuleInit {
  private readonly logger = new Logger(ProviderRegistry.name)
  private readonly providers = new Map<string, ISportsbookProvider>()
  private defaultProviderName = "mock"

  constructor(private readonly mockProvider: MockProvider) {}

  onModuleInit() {
    this.register(this.mockProvider)
    this.logger.log(`ProviderRegistry initialised with: [${this.list().join(", ")}]`)
  }

  /** Register a provider. Last registration wins for duplicate names. */
  register(provider: ISportsbookProvider): void {
    this.providers.set(provider.name, provider)
    this.logger.log(`Registered provider: ${provider.displayName} (${provider.name})`)
  }

  /**
   * Resolve a provider by name.
   * Falls back to the default provider when name is "auto" or omitted.
   */
  resolve(name?: string): ISportsbookProvider {
    const key = !name || name === "auto" ? this.defaultProviderName : name
    const provider = this.providers.get(key)
    if (!provider) {
      throw new Error(
        `Provider "${key}" is not registered. Available: [${this.list().join(", ")}]`
      )
    }
    return provider
  }

  /** Return all registered provider names. */
  list(): string[] {
    return Array.from(this.providers.keys())
  }

  /** Return all registered provider instances. */
  all(): ISportsbookProvider[] {
    return Array.from(this.providers.values())
  }

  /** Set the provider used when no name is specified. */
  setDefault(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`Cannot set default: provider "${name}" is not registered`)
    }
    this.defaultProviderName = name
    this.logger.log(`Default provider set to: ${name}`)
  }

  getDefault(): ISportsbookProvider {
    return this.resolve(this.defaultProviderName)
  }

  /** Run health checks on all registered providers concurrently. */
  async healthCheckAll() {
    return Promise.all(this.all().map((p) => p.healthCheck()))
  }
}
