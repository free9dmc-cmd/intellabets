/**
 * Convert American odds to decimal multiplier
 */
export function americanToDecimal(odds: number): number {
  if (odds > 0) return odds / 100 + 1
  return 100 / Math.abs(odds) + 1
}

/**
 * Convert decimal odds to American format
 */
export function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) return Math.round((decimal - 1) * 100)
  return Math.round(-100 / (decimal - 1))
}

/**
 * Calculate parlay total odds from array of American odds
 */
export function calcParlayOdds(americanOddsArr: number[]): number {
  const decimal = americanOddsArr.reduce((acc, o) => acc * americanToDecimal(o), 1)
  return decimalToAmerican(decimal)
}

/**
 * Calculate potential return from stake and American odds
 */
export function calcPotentialReturn(stake: number, americanOdds: number): number {
  return stake * americanToDecimal(americanOdds)
}

/**
 * Format American odds with +/- sign
 */
export function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`
}

/**
 * Format currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount)
}

/**
 * Format win rate as percentage
 */
export function formatWinRate(wins: number, losses: number): string {
  if (wins + losses === 0) return "N/A"
  return `${((wins / (wins + losses)) * 100).toFixed(1)}%`
}

/**
 * Calculate ROI percentage
 */
export function calcROI(profitLoss: number, totalStake: number): number {
  if (totalStake === 0) return 0
  return (profitLoss / totalStake) * 100
}

/**
 * Get color class based on status
 */
export function statusColor(status: string): string {
  switch (status) {
    case "won":
      return "text-emerald-400"
    case "lost":
      return "text-red-400"
    case "push":
      return "text-yellow-400"
    default:
      return "text-gray-400"
  }
}

/**
 * Get background color class based on status
 */
export function statusBg(status: string): string {
  switch (status) {
    case "won":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    case "lost":
      return "bg-red-500/10 text-red-400 border-red-500/20"
    case "push":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
    default:
      return "bg-gray-500/10 text-gray-400 border-gray-500/20"
  }
}

/**
 * Relative time formatting
 */
export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/**
 * Sport emoji mapping
 */
export const SPORT_EMOJIS: Record<string, string> = {
  NFL: "🏈",
  NBA: "🏀",
  MLB: "⚾",
  NHL: "🏒",
  Soccer: "⚽",
  UFC: "🥊",
  Tennis: "🎾",
  Golf: "⛳",
  NCAA: "🎓",
  Other: "🏆",
}

export const SPORTS = ["NFL", "NBA", "MLB", "NHL", "Soccer", "UFC", "Tennis", "Golf", "NCAA", "Other"]

export const PLATFORM_FEE = 0.20 // 20%
export const PREMIUM_PRICE = 19.99
export const AI_PRICE = 9.99
