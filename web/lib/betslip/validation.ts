import type { BetDraft } from "./types"

/** The slice of the form that validation needs to look at. */
interface ValidatableBetslip {
  title: string
  bets: ReadonlyArray<Pick<BetDraft, "game" | "pick" | "odds">>
}

/**
 * Check a betslip before submitting it.
 *
 * Returns the first problem as a user-facing message, or null when the form
 * is valid. This is a convenience check for fast feedback — the API route
 * remains the real gatekeeper, since anyone can call it without this form.
 */
export function validateBetslipDraft(draft: ValidatableBetslip): string | null {
  if (!draft.title.trim()) return "Title is required"
  if (draft.bets.some((bet) => !bet.game || !bet.pick || !bet.odds)) {
    return "Fill in all bet details (game, pick, odds)"
  }
  return null
}
