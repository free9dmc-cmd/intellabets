import { formatOdds } from "@/lib/utils"
import type { BetslipTotals } from "@/lib/betslip/types"
import StatTile from "@/components/ui/StatTile"

interface Props {
  totals: BetslipTotals
}

/** Shown in place of a figure that can't be computed from what has been entered yet. */
const NOT_AVAILABLE = "—"

function orDash(value: number | null, format: (value: number) => string): string {
  return value === null ? NOT_AVAILABLE : format(value)
}

/** Total odds, stake and potential return for the betslip being built. */
export default function BetslipSummary({ totals }: Props) {
  return (
    <div className="card p-5 border-purple-500/20">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Summary</h3>
      <div className="grid grid-cols-3 gap-3 text-center">
        <StatTile label="Total Odds" value={orDash(totals.totalOdds, formatOdds)} />
        <StatTile label="Stake" value={orDash(totals.stake, (stake) => `$${stake}`)} />
        <StatTile
          label="Potential Return"
          value={orDash(totals.potentialReturn, (amount) => `$${amount.toFixed(2)}`)}
          tone={totals.potentialReturn === null ? "default" : "positive"}
        />
      </div>
    </div>
  )
}
