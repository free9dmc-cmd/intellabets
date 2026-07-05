import { Body, Controller, Post, UseGuards, Get, HttpCode } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger"
import { AuthService } from "./auth.service"
import { RegisterDto, LoginDto, RefreshDto } from "./dto/auth.dto"
import { JwtAuthGuard } from "./guards/jwt-auth.guard"
import { CurrentUser } from "./decorators/current-user.decorator"
import type { AuthenticatedUser } from "./jwt.strategy"

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @ApiOperation({ summary: "Create a new account" })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto)
  }

  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "Log in with email + password" })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto)
  }

  @Post("refresh")
  @HttpCode(200)
  @ApiOperation({ summary: "Exchange a refresh token for a new token pair" })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken)
  }

  @Post("logout")
  @HttpCode(200)
  @ApiOperation({ summary: "Revoke a refresh token" })
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken)
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the current authenticated user" })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user
  }
}
