import { formatOdds } from "@/lib/utils"
import type { BetslipTotals } from "@/lib/betslip/types"
import StatTile from "@/components/ui/StatTile"

interface Props {
  totals: BetslipTotals
}

/** Total odds, stake and potential return for the betslip being built. */
export default function BetslipSummary({ totals }: Props) {
  return (
    <div className="card p-5 border-purple-500/20">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Summary</h3>
      <div className="grid grid-cols-3 gap-3 text-center">
        <StatTile label="Total Odds" value={formatOdds(totals.totalOdds)} />
        <StatTile label="Stake" value={`$${totals.stake}`} />
        <StatTile
          label="Potential Return"
          value={`$${totals.potentialReturn.toFixed(2)}`}
          tone="positive"
        />
      </div>
    </div>
  )
}
