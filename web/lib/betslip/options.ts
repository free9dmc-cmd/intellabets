import { SPORTS, SPORT_EMOJIS } from "@/lib/utils"
import { BET_TYPES } from "./draft"

/** One dropdown entry: what the user sees (`label`) and what is stored and sent (`value`). */
interface Option {
  value: string
  label: string
}

/**
 * Sports for the betslip form. The emoji is decoration only: `value` is the
 * plain sport name, which is what gets saved and what filters match against.
 * (An <option> without an explicit value submits its visible text, which once
 * stored "🏀 NBA" instead of "NBA".)
 */
export const SPORT_OPTIONS: readonly Option[] = SPORTS.map((sport) => ({
  value: sport,
  label: `${SPORT_EMOJIS[sport]} ${sport}`,
}))

export const BET_TYPE_OPTIONS: readonly Option[] = BET_TYPES.map((type) => ({
  value: type,
  label: type,
}))
