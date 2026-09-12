import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { AuthGuard } from "@nestjs/passport"

/**
 * Allows either:
 *   1. A trusted first-party service presenting ENGINE_SERVICE_KEY, or
 *   2. A signed-in premium (or admin) user holding a JWT.
 *
 * Case 1 exists because the consumer web app keeps its own user table
 * (NextAuth/Postgres) separate from this API's. A web user has no JWT here, so
 * the web app authenticates its OWN user first, checks their entitlement, and
 * then calls this API server-to-server on their behalf.
 *
 * The service key must therefore never reach a browser — it is only ever used
 * from the web app's server-side route handlers.
 */
@Injectable()
export class ServiceOrPremiumGuard implements CanActivate {
  private readonly jwtGuard = new (AuthGuard("jwt"))()

  constructor(private readonly config: ConfigService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest()

    const serviceKey = this.config.get<string>("ENGINE_SERVICE_KEY")
    const presented = req.headers?.["x-engine-key"]
    if (serviceKey && serviceKey.length >= 16 && presented === serviceKey) {
      req.isServiceCall = true
      return true
    }

    // Fall back to a normal signed-in user.
    const ok = await Promise.resolve(this.jwtGuard.canActivate(ctx)).catch(() => false)
    if (!ok) return false

    const user = req.user
    if (!user?.isPremium && !user?.isAdmin) {
      throw new ForbiddenException("Premium membership required")
    }
    return true
  }
}
