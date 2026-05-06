// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  username: string
  name: string
  image?: string
  isPremium: boolean
  isVerified: boolean
  isAdmin: boolean
  bio?: string
  specialties?: string[]
  subscriptionPrice: number
  winRate: number
  roi: number
  subscriberCount: number
  totalEarnings: number
  createdAt: string
}

// ─── Betslip ──────────────────────────────────────────────────────────────────

export type BetType = "moneyline" | "spread" | "total" | "parlay" | "same-game-parlay" | "prop"
export type BetResult = "won" | "lost" | "push" | "pending"
export type BetslipStatus = "pending" | "won" | "lost" | "push" | "cancelled"
export type RiskLevel = "low" | "medium" | "high"
export type Sport = "NFL" | "NBA" | "MLB" | "NHL" | "Soccer" | "UFC" | "Tennis" | "Golf" | "NCAA"

export interface Bet {
  id: string
  game: string
  homeTeam?: string
  awayTeam?: string
  pick: string
  odds: number
  betType: BetType
  line?: string
  sport: Sport
  gameDate?: string
  result?: BetResult
  reasoning?: string
}

export interface Betslip {
  id: string
  userId: string
  user: Pick<User, "id" | "username" | "name" | "image" | "isVerified">
  title: string
  description?: string
  sport: Sport
  league?: string
  bets: Bet[]
  totalOdds: number
  stake: number
  potentialReturn: number
  isPublic: boolean
  isAI: boolean
  status: BetslipStatus
  profitLoss: number
  confidence?: number
  analysis?: string
  createdAt: string
  settledAt?: string
}

// ─── Subscription ─────────────────────────────────────────────────────────────

export type SubscriptionStatus = "active" | "cancelled" | "expired"

export interface Subscription {
  id: string
  subscriberId: string
  tipsterId: string
  tipster: Pick<User, "id" | "username" | "name" | "image" | "isVerified">
  price: number
  status: SubscriptionStatus
  createdAt: string
  expiresAt: string
}

export interface AISubscription {
  id: string
  userId: string
  status: SubscriptionStatus
  createdAt: string
  expiresAt: string
}

// ─── Payout ───────────────────────────────────────────────────────────────────

export type PayoutStatus = "pending" | "processing" | "paid"

export interface Payout {
  id: string
  userId: string
  amount: number
  fee: number
  netAmount: number
  period: string
  status: PayoutStatus
  createdAt: string
  paidAt?: string
}

// ─── Sportsbook ───────────────────────────────────────────────────────────────

export type SportsbookProvider = "DraftKings" | "FanDuel" | "BetMGM" | "Caesars" | "PointsBet"

export interface SportsbookConnection {
  id: string
  userId: string
  provider: SportsbookProvider
  isActive: boolean
  connectedAt: string
}

export interface OddsLine {
  bookmaker: SportsbookProvider
  market: BetType
  price: number
  point?: number
  updatedAt: string
}

export interface LiveOdds {
  gameId: string
  homeTeam: string
  awayTeam: string
  sport: Sport
  commenceTime: string
  lines: OddsLine[]
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface ApiError {
  statusCode: number
  message: string
  error?: string
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface JwtPayload {
  sub: string
  email: string
  username: string
  isPremium: boolean
  isAdmin: boolean
  iat: number
  exp: number
}
