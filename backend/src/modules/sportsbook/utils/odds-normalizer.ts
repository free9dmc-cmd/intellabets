import type { NormalizedOdds, OddsFormat, RawOdds } from "../types/provider.types"

// ─── Core conversions ─────────────────────────────────────────────────────────

export function americanToDecimal(american: number): number {
  if (american === 0) throw new RangeError("American odds cannot be 0")
  if (american > 0) return american / 100 + 1
  return 100 / Math.abs(american) + 1
}

export function decimalToAmerican(decimal: number): number {
  if (decimal <= 1) throw new RangeError(`Decimal odds must be > 1, got ${decimal}`)
  if (decimal >= 2) return Math.round((decimal - 1) * 100)
  return Math.round(-100 / (decimal - 1))
}

export function fractionalToDecimal(fractional: string): number {
  const parts = fractional.split("/")
  if (parts.length !== 2) throw new Error(`Invalid fractional odds: "${fractional}"`)
  const [num, den] = parts.map(Number)
  if (!num || !den || den === 0) throw new Error(`Invalid fractional odds: "${fractional}"`)
  return num / den + 1
}

export function decimalToFractional(decimal: number): string {
  if (decimal <= 1) throw new RangeError(`Decimal odds must be > 1, got ${decimal}`)
  const profit = decimal - 1

  // Approximate to nearest 1/100 then simplify
  const tolerance = 1e-4
  let bestNum = 1
  let bestDen = 1
  let bestError = Math.abs(profit - bestNum / bestDen)

  for (let den = 1; den <= 100; den++) {
    const num = Math.round(profit * den)
    const error = Math.abs(profit - num / den)
    if (error < bestError - tolerance) {
      bestError = error
      bestNum = num
      bestDen = den
    }
    if (bestError < tolerance) break
  }

  const g = gcd(bestNum, bestDen)
  return `${bestNum / g}/${bestDen / g}`
}

// ─── Implied probability ──────────────────────────────────────────────────────

/** Raw implied probability (includes vig). */
export function impliedProbability(decimal: number): number {
  if (decimal <= 0) throw new RangeError(`Decimal odds must be positive, got ${decimal}`)
  return 1 / decimal
}

/** Remove the bookmaker's vig from a set of implied probabilities. */
export function removeVig(probabilities: number[]): number[] {
  const overround = probabilities.reduce((sum, p) => sum + p, 0)
  return probabilities.map((p) => p / overround)
}

// ─── Main normalizer ──────────────────────────────────────────────────────────

export function normalizeOdds(raw: RawOdds): NormalizedOdds {
  let decimal: number

  switch (raw.format) {
    case "decimal":
      decimal = Number(raw.value)
      if (isNaN(decimal)) throw new Error(`Invalid decimal odds: ${raw.value}`)
      break
    case "american":
      decimal = americanToDecimal(Number(raw.value))
      break
    case "fractional":
      decimal = fractionalToDecimal(String(raw.value))
      break
    default:
      throw new Error(`Unknown odds format: ${(raw as RawOdds).format}`)
  }

  return {
    american: decimalToAmerican(decimal),
    decimal: parseFloat(decimal.toFixed(4)),
    fractional: decimalToFractional(decimal),
    impliedProbability: parseFloat(impliedProbability(decimal).toFixed(6)),
  }
}

/** Normalise a bare American odds value (most common in US sportsbooks). */
export function fromAmerican(american: number): NormalizedOdds {
  return normalizeOdds({ format: "american", value: american })
}

/** Normalise a bare decimal odds value. */
export function fromDecimal(decimal: number): NormalizedOdds {
  return normalizeOdds({ format: "decimal", value: decimal })
}

/** Normalise a fractional odds string. */
export function fromFractional(fractional: string): NormalizedOdds {
  return normalizeOdds({ format: "fractional", value: fractional })
}

// ─── Market name normalisation ────────────────────────────────────────────────

const MARKET_NAME_MAP: Record<string, string> = {
  // Moneyline variants
  "h2h": "moneyline",
  "ml": "moneyline",
  "money line": "moneyline",
  "match winner": "moneyline",
  "1x2": "moneyline",
  // Spread variants
  "spreads": "spread",
  "point spread": "spread",
  "handicap": "spread",
  "asian handicap": "spread",
  // Totals variants
  "totals": "total",
  "over/under": "total",
  "game total": "total",
  "o/u": "total",
  // Props
  "player props": "prop",
  "player prop": "prop",
  "player specials": "prop",
}

export function normalizeMarketName(raw: string): string {
  const key = raw.toLowerCase().trim()
  return MARKET_NAME_MAP[key] ?? key
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}
