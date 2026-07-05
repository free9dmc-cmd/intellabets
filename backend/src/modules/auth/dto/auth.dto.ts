import { IsEmail, IsString, MinLength, MaxLength, Matches } from "class-validator"

export class RegisterDto {
  @IsEmail()
  email: string

  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: "Username may only contain letters, numbers, and underscores" })
  username: string

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt max
  password: string
}

export class LoginDto {
  @IsEmail()
  email: string

  @IsString()
  password: string
}

export class RefreshDto {
  @IsString()
  refreshToken: string
}
