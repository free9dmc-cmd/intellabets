import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Min, Max, ValidateNested, ArrayMinSize, MaxLength } from "class-validator"
import { Type } from "class-transformer"

export class BetslipLegDto {
  @IsString() @MaxLength(160)
  game: string

  @IsString() @MaxLength(120)
  selection: string

  @IsNumber()
  odds: number // decimal

  @IsString()
  marketType: string

  @IsString()
  sport: string

  @IsOptional() @IsString() @MaxLength(500)
  reasoning?: string
}

export class CreateBetslipDto {
  @IsString() @MaxLength(120)
  title: string

  @IsOptional() @IsString() @MaxLength(1000)
  description?: string

  @IsString()
  sport: string

  @IsNumber() @Min(1) @Max(100000)
  stake: number

  @IsOptional() @IsBoolean()
  isPublic?: boolean

  @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BetslipLegDto)
  legs: BetslipLegDto[]
}

export class GenerateBetslipDto {
  @IsOptional() @IsString()
  sport?: string

  @IsOptional() @IsNumber() @Min(1) @Max(8)
  legCount?: number

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  minConfidence?: number

  @IsOptional() @IsNumber() @Min(1)
  stake?: number

  @IsOptional() @IsBoolean()
  publish?: boolean
}
