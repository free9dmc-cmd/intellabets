import { formatCurrency, formatOdds } from "@/lib/utils"
import type { AIBet, AIBetslip } from "@/lib/ai-types"
import StatTile from "@/components/ui/StatTile"

/** Green for strong confidence, yellow for middling, red for weak. */
function confidenceColor(confidence: number): string {
  if (confidence >= 75) return "text-emerald-400"
  if (confidence >= 55) return "text-yellow-400"
  return "text-red-400"
}

function PickCard({ bet }: { bet: AIBet }) {
  return (
    <div className="p-4 rounded-lg border border-gray-800" style={{ background: "rgba(255,255,255,0.02)" }}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="font-medium text-white text-sm">{bet.game}</div>
          <div className="text-xs text-gray-400 mt-0.5">{bet.pick}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`font-bold ${bet.odds > 0 ? "text-emerald-400" : "text-white"}`}>
            {formatOdds(bet.odds)}
          </div>
          <div className="text-xs text-gray-500 capitalize">{bet.betType}</div>
        </div>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed border-t border-gray-800/50 pt-2 mt-2">
        {bet.reasoning}
      </p>
    </div>
  )
}

interface Props {
  betslip: AIBetslip
}

/** A generated betslip: headline figures, each pick with its reasoning, and the analysis. */
export default function AIBetslipResult({ betslip }: Props) {
  return (
    <div className="card p-6 space-y-5 animate-slide-up border-purple-500/20">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-black text-xl text-white">{betslip.title}</h2>
          <p className="text-gray-400 text-sm mt-1">{betslip.description}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`text-2xl font-black ${confidenceColor(betslip.confidence)}`}>
            {betslip.confidence}%
          </div>
          <div className="text-xs text-gray-500">confidence</div>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile framed label="Total Odds" value={formatOdds(betslip.totalOdds)} />
        <StatTile framed label="Rec. Stake" value={`$${betslip.stake}`} />
        <StatTile
          framed
          label="Potential Return"
          value={formatCurrency(betslip.potentialReturn)}
          tone="positive"
        />
      </div>

      {/* Individual bets */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Picks</h3>
        {betslip.bets.map((bet, i) => (
          <PickCard key={i} bet={bet} />
        ))}
      </div>

      {/* AI analysis */}
      <div className="p-4 rounded-lg bg-purple-500/5 border border-purple-500/20">
        <div className="text-xs text-purple-400 font-semibold uppercase tracking-wide mb-2">
          🧠 AI Analysis
        </div>
        <p className="text-gray-300 text-sm leading-relaxed">{betslip.analysis}</p>
      </div>

      <p className="text-xs text-gray-600 text-center">
        AI predictions are for entertainment. Please gamble responsibly.
      </p>
    </div>
  )
}
