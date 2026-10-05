import { memo } from "react"
import { BET_TYPES } from "@/lib/betslip/draft"
import type { BetDraft } from "@/lib/betslip/types"
import FormField from "@/components/ui/FormField"
import TextField from "@/components/ui/TextField"

interface Props {
  bet: BetDraft
  /** Position in the betslip; also what the callbacks use to find this leg. */
  index: number
  canRemove: boolean
  onChange: (index: number, field: keyof BetDraft, value: string) => void
  onRemove: (index: number) => void
}

/** The editable fields of one leg of a betslip. */
function BetRow({ bet, index, canRemove, onChange, onRemove }: Props) {
  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-300">Bet #{index + 1}</span>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="text-red-400 hover:text-red-300 text-sm"
          >
            Remove
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextField
          size="sm"
          className="col-span-2"
          label="Game *"
          value={bet.game}
          onChange={(value) => onChange(index, "game", value)}
          placeholder="e.g. Kansas City Chiefs @ Las Vegas Raiders"
          required
        />
        <TextField
          size="sm"
          label="Pick *"
          value={bet.pick}
          onChange={(value) => onChange(index, "pick", value)}
          placeholder="e.g. Chiefs -4.5"
          required
        />
        <TextField
          size="sm"
          label="Odds (American) *"
          value={bet.odds}
          onChange={(value) => onChange(index, "odds", value)}
          placeholder="-110"
          required
        />
        <FormField size="sm" label="Bet Type">
          <select
            value={bet.betType}
            onChange={(e) => onChange(index, "betType", e.target.value)}
            className="input-dark text-sm"
          >
            {BET_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </FormField>
        <TextField
          size="sm"
          label="Line / Total"
          value={bet.line}
          onChange={(value) => onChange(index, "line", value)}
          placeholder="e.g. -4.5 or O/U 47.5"
        />
        <TextField
          size="sm"
          label="Game Date"
          type="date"
          value={bet.gameDate}
          onChange={(value) => onChange(index, "gameDate", value)}
        />
      </div>
    </div>
  )
}

// memo() skips re-rendering a row when none of its props changed. Combined with
// the reducer (untouched legs keep their identity) and the hook (stable
// callbacks), typing in one leg no longer re-renders the others.
export default memo(BetRow)
