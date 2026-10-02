import {
  AI_PRICE,
  PLATFORM_FEE,
  PREMIUM_PRICE,
  TIPSTER_SUB_MAX_PRICE,
  TIPSTER_SUB_MIN_PRICE,
  formatCurrency,
} from "@/lib/utils"

/**
 * Facts the legal documents depend on, each stated exactly once.
 *
 * The Privacy Policy, Terms, and Support & Refunds page all reference these
 * instead of repeating them, so a change here (a new support address, a price
 * change) updates every document at the same time. Two copies of a fact
 * eventually disagree — which is precisely how the old cPanel pages and the
 * in-app pages drifted apart.
 */

export const BRAND = "IntellaBets"
export const LEGAL_ENTITY = "Black Rose Studios, Inc."
/** How the operator is named in contracts: the legal entity plus the trade name. */
export const OPERATOR = `${LEGAL_ENTITY}, doing business as ${BRAND}`

export const SITE_URL = "https://intellabets.com"
/** "intellabets.com" — derived, so it can never disagree with SITE_URL. */
export const SITE_HOST = new URL(SITE_URL).host

export const SUPPORT_EMAIL = "support@intellabets.com"
/** Pre-built RichText link, so no document hand-types the mailto: URL. */
export const SUPPORT_EMAIL_LINK = `[${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL})`
export const SUPPORT_RESPONSE_BUSINESS_DAYS = 2

export const GOVERNING_STATE = "Arizona"
export const DISPUTE_VENUE = "Maricopa County, Arizona"

export const MINIMUM_AGE = 18
export const REFUND_WINDOW_DAYS = 30
export const PRICE_CHANGE_NOTICE_DAYS = 30
export const DELETION_COMPLETION_DAYS = 30
export const PRIVACY_REQUEST_RESPONSE_DAYS = 45
/** Liability cap: what the customer paid us over this many months before the claim. */
export const LIABILITY_CAP_MONTHS = 3

/**
 * Prices, pre-formatted for prose. Derived from the same constants the pricing
 * page and checkout use, so the Terms can never quote a different price.
 */
export const PRICES = {
  premium: formatCurrency(PREMIUM_PRICE),
  aiPicks: formatCurrency(AI_PRICE),
  tipsterMin: formatCurrency(TIPSTER_SUB_MIN_PRICE),
  tipsterMax: formatCurrency(TIPSTER_SUB_MAX_PRICE),
} as const

/** Revenue split, as whole percentages (PLATFORM_FEE 0.2 -> 20 / 80). */
export const PLATFORM_FEE_PERCENT = Math.round(PLATFORM_FEE * 100)
export const TIPSTER_SHARE_PERCENT = 100 - PLATFORM_FEE_PERCENT

/** Problem-gambling resources, matching those shown elsewhere on the site. */
export const HELPLINES = {
  ncpg: {
    name: "National Council on Problem Gambling",
    url: "https://www.ncpgambling.org",
    phone: "1-800-522-4700",
  },
  gamblersAnonymous: {
    name: "Gamblers Anonymous",
    url: "https://www.gamblersanonymous.org",
  },
} as const
