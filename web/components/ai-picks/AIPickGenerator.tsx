import { useState } from "react"
import { SPORTS } from "@/lib/utils"
import type { AIPickOptions } from "@/hooks/useAIPicks"
import ErrorBanner from "@/components/ui/ErrorBanner"
import SelectField, { type SelectOption } from "@/components/ui/SelectField"

const SPORT_OPTIONS: SelectOption[] = SPORTS.map((sport) => ({ value: sport, label: sport }))

const BET_TYPE_OPTIONS: SelectOption[] = [
  { value: "single", label: "Single Bet" },
  { value: "parlay", label: "Parlay" },
  { value: "same-game-parlay", label: "Same-Game Parlay" },
]

const RISK_LEVELS = [
  { value: "low", label: "🛡️ Safe", desc: "Strong favorites, -200 to -110" },
  { value: "medium", label: "⚡ Balanced", desc: "Mixed picks, -150 to +150" },
  { value: "high", label: "🚀 High Value", desc: "Upsets & parlays, +100 to +350" },
]

interface Props {
  loading: boolean
  error: string
  onGenerate: (options: AIPickOptions) => void
}

/** The sport / bet type / risk pickers and the button that generates a betslip. */
export default function AIPickGenerator({ loading, error, onGenerate }: Props) {
  const [sport, setSport] = useState("NFL")
  const [betType, setBetType] = useState("single")
  const [riskLevel, setRiskLevel] = useState("medium")

  return (
    <div className="card p-6">
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <SelectField variant="caps" label="Sport" value={sport} onChange={setSport} options={SPORT_OPTIONS} />
        <SelectField variant="caps" label="Bet Type" value={betType} onChange={setBetType} options={BET_TYPE_OPTIONS} />
        <SelectField variant="caps" label="Risk Level" value={riskLevel} onChange={setRiskLevel} options={RISK_LEVELS} />
      </div>

      {/* Risk description */}
      <div className="mb-4 text-sm text-gray-400 p-3 rounded-lg bg-white/3 border border-gray-800">
        {RISK_LEVELS.find((r) => r.value === riskLevel)?.desc}
      </div>

      <ErrorBanner message={error} className="mb-4" />

      <button
        onClick={() => onGenerate({ sport, betType, riskLevel })}
        disabled={loading}
        className="btn-primary w-full py-3 font-semibold"
        style={{ borderRadius: "10px", opacity: loading ? 0.8 : 1 }}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Analyzing matchups...
          </span>
        ) : "Generate AI Betslip ✨"}
      </button>
    </div>
  )
}
