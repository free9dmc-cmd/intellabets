import { Injectable, UnauthorizedException } from "@nestjs/common"
import { PassportStrategy } from "@nestjs/passport"
import { ExtractJwt, Strategy } from "passport-jwt"
import { ConfigService } from "@nestjs/config"
import { PrismaService } from "../../common/prisma/prisma.service"

export interface JwtPayload {
  sub: string
  email: string
  username: string
  isPremium: boolean
  isAdmin: boolean
}

export interface AuthenticatedUser {
  id: string
  email: string
  username: string
  isPremium: boolean
  isAdmin: boolean
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET") ?? "dev-secret-change-me",
    })
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, username: true, isPremium: true, isAdmin: true, premiumUntil: true },
    })
    if (!user) throw new UnauthorizedException("User no longer exists")

    // Premium may have lapsed since the token was issued.
    const isPremium = user.isPremium && (!user.premiumUntil || user.premiumUntil > new Date())

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      isPremium,
      isAdmin: user.isAdmin,
    }
  }
}
