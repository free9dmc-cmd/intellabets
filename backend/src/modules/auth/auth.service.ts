import { Injectable, ConflictException, UnauthorizedException } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { ConfigService } from "@nestjs/config"
import * as bcrypt from "bcryptjs"
import { createHash, randomBytes } from "crypto"
import { PrismaService } from "../../common/prisma/prisma.service"
import type { RegisterDto, LoginDto } from "./dto/auth.dto"
import type { JwtPayload } from "./jwt.strategy"

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email.toLowerCase() }, { username: dto.username }] },
    })
    if (existing) {
      throw new ConflictException(
        existing.email === dto.email.toLowerCase() ? "Email already registered" : "Username taken"
      )
    }

    const adminEmails = (this.config.get<string>("ADMIN_EMAILS") ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        username: dto.username,
        name: dto.name,
        password: await bcrypt.hash(dto.password, 12),
        isAdmin: adminEmails.includes(dto.email.toLowerCase()),
        image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${dto.username}`,
      },
    })

    return this.issueTokens(user)
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } })
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException("Invalid email or password")
    }
    return this.issueTokens(user)
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hash(refreshToken)
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    })

    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid or expired refresh token")
    }

    // Rotate: revoke the old token, issue a fresh pair.
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } })
    return this.issueTokens(stored.user)
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hash(refreshToken)
    await this.prisma.refreshToken.updateMany({ where: { tokenHash }, data: { revoked: true } })
    return { success: true }
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private async issueTokens(user: {
    id: string; email: string; username: string; isPremium: boolean; isAdmin: boolean; premiumUntil?: Date | null
  }) {
    const isPremium = user.isPremium && (!user.premiumUntil || user.premiumUntil > new Date())
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      isPremium,
      isAdmin: user.isAdmin,
    }

    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.config.get("JWT_EXPIRES_IN") ?? "7d",
    })

    const refreshToken = randomBytes(48).toString("hex")
    const refreshExpiresDays = 30
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hash(refreshToken),
        expiresAt: new Date(Date.now() + refreshExpiresDays * 24 * 60 * 60 * 1000),
      },
    })

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        isPremium,
        isAdmin: user.isAdmin,
      },
    }
  }

  private hash(token: string): string {
    return createHash("sha256").update(token).digest("hex")
  }
}
