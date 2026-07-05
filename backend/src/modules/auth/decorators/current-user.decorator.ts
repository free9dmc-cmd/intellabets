import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common"
import type { AuthenticatedUser } from "../jwt.strategy"
import { IS_PREMIUM_KEY, IS_ADMIN_KEY } from "../guards/jwt-auth.guard"

/** Inject the authenticated user into a controller handler param. */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest().user as AuthenticatedUser
    return data ? user?.[data] : user
  }
)

export const RequirePremium = () => SetMetadata(IS_PREMIUM_KEY, true)
export const RequireAdmin = () => SetMetadata(IS_ADMIN_KEY, true)
