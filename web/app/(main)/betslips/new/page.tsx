"use client"

import type { FormEvent } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useBetslipForm } from "@/hooks/useBetslipForm"
import BetRow from "@/components/betslip/BetRow"
import BetslipDetailsCard from "@/components/betslip/BetslipDetailsCard"
import BetslipSummary from "@/components/betslip/BetslipSummary"
import ErrorBanner from "@/components/ui/ErrorBanner"

function PremiumRequired() {
  return (
    <div className="max-w-md mx-auto text-center py-20">
      <div className="text-5xl mb-4">🔒</div>
      <h1 className="text-xl font-bold text-white mb-2">Premium Required</h1>
      <p className="text-gray-400 mb-6">Upgrade to Premium to create and sell betslips.</p>
      <Link href="/premium" className="btn-primary">Upgrade Now</Link>
    </div>
  )
}

export default function NewBetslipPage() {
  const { data: session } = useSession()
  // Hooks must run on every render, before any early return below.
  const { draft, totals, saving, error, actions } = useBetslipForm()

  if (!session?.user?.isPremium) return <PremiumRequired />

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    void actions.submit()
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/betslips" className="text-gray-400 hover:text-white">← Back</Link>
        <h1 className="text-xl font-black text-white">Create Betslip</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <BetslipDetailsCard details={draft} onFieldChange={actions.setField} />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white text-sm uppercase tracking-wide">Bets ({draft.bets.length})</h2>
            <button type="button" onClick={actions.addBet} className="btn-secondary text-xs py-1.5 px-3">
              + Add Bet
            </button>
          </div>

          {draft.bets.map((bet, i) => (
            // An index key is safe here: every input is controlled by reducer
            // state, so no DOM state can end up attached to the wrong row.
            <BetRow
              key={i}
              bet={bet}
              index={i}
              canRemove={draft.bets.length > 1}
              onChange={actions.updateBet}
              onRemove={actions.removeBet}
            />
          ))}
        </div>

        <BetslipSummary totals={totals} />

        <ErrorBanner message={error} />

        <button
          type="submit"
          disabled={saving}
          className="btn-primary w-full py-3 font-semibold"
          style={{ borderRadius: "10px", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Publishing..." : "Publish Betslip"}
        </button>
      </form>
    </div>
  )
}
