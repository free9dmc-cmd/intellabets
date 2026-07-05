import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common"
import { AuthGuard } from "@nestjs/passport"
import { Reflector } from "@nestjs/core"

/** Standard JWT guard — requires a valid bearer token. */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}

export const IS_PREMIUM_KEY = "requirePremium"
export const IS_ADMIN_KEY = "requireAdmin"

/** Guard that additionally requires the user to be premium or admin. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requirePremium = this.reflector.getAllAndOverride<boolean>(IS_PREMIUM_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    const requireAdmin = this.reflector.getAllAndOverride<boolean>(IS_ADMIN_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])

    const { user } = ctx.switchToHttp().getRequest()
    if (!user) return false

    if (requireAdmin && !user.isAdmin) throw new ForbiddenException("Admin access required")
    if (requirePremium && !user.isPremium && !user.isAdmin) {
      throw new ForbiddenException("Premium membership required")
    }
    return true
  }
}
