const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const LONG_DATE = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  // A policy date is a calendar date, not a moment in time. Without pinning
  // the zone, "2026-09-29" is parsed as UTC midnight and a server or browser
  // in Arizona (UTC-7) would print "September 28, 2026".
  timeZone: "UTC",
})

/**
 * "2026-09-29" -> "September 29, 2026".
 * Throws on a malformed date so a typo fails the build instead of shipping
 * a policy that reads "Invalid Date".
 */
export function formatLegalDate(isoDate: string): string {
  if (!ISO_DATE.test(isoDate)) {
    throw new Error(`Legal document date must be YYYY-MM-DD, got "${isoDate}"`)
  }
  const date = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) {
    throw new Error(`Legal document date is not a real calendar date: "${isoDate}"`)
  }
  return LONG_DATE.format(date)
}
