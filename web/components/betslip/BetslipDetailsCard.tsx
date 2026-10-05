import type { DetailsField } from "@/lib/betslip/draft"
import { SPORT_OPTIONS } from "@/lib/betslip/options"
import type { BetslipDetails, BetslipDraft } from "@/lib/betslip/types"
import FormField from "@/components/ui/FormField"
import SelectField from "@/components/ui/SelectField"
import TextField from "@/components/ui/TextField"

interface Props {
  details: BetslipDetails
  /** Called with the field being edited and its new value. */
  onFieldChange: <K extends DetailsField>(field: K, value: BetslipDraft[K]) => void
}

/** Title, description, sport, league, stake and visibility for a betslip. */
export default function BetslipDetailsCard({ details, onFieldChange }: Props) {
  return (
    <div className="card p-6 space-y-4">
      <h2 className="font-bold text-white text-sm uppercase tracking-wide">Betslip Details</h2>

      <TextField
        label="Title *"
        value={details.title}
        onChange={(value) => onFieldChange("title", value)}
        placeholder="e.g. NFL Thursday Value Pack"
        required
      />

      <FormField label="Description (optional)">
        <textarea
          value={details.description}
          onChange={(e) => onFieldChange("description", e.target.value)}
          className="input-dark"
          style={{ minHeight: "80px", resize: "vertical" }}
          placeholder="Brief analysis or strategy note for subscribers..."
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label="Sport"
          value={details.sport}
          onChange={(value) => onFieldChange("sport", value)}
          options={SPORT_OPTIONS}
        />
        <TextField
          label="League (optional)"
          value={details.league}
          onChange={(value) => onFieldChange("league", value)}
          placeholder="e.g. NFL Week 14"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Stake ($)"
          type="number"
          value={details.stake}
          onChange={(value) => onFieldChange("stake", value)}
          min="1"
          max="10000"
          step="0.01"
        />
        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={details.isPublic}
              onChange={(e) => onFieldChange("isPublic", e.target.checked)}
              className="w-4 h-4 rounded accent-purple-500"
            />
            <span className="text-sm text-gray-300">Make public (free preview)</span>
          </label>
        </div>
      </div>
    </div>
  )
}
