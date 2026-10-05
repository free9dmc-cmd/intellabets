import { useCallback, useReducer, useState } from "react"
import { useRouter } from "next/navigation"
import { calcBetslipTotals } from "@/lib/betslip/calculations"
import {
  betslipDraftReducer,
  createInitialDraft,
  toBetslipPayload,
  type BetslipDraftAction,
  type DetailsField,
} from "@/lib/betslip/draft"
import { validateBetslipDraft } from "@/lib/betslip/validation"
import type { BetDraft, BetslipDraft } from "@/lib/betslip/types"

/**
 * Everything the create-betslip screen needs, so the page can stay a layout.
 *
 * Responsibilities are split three ways:
 *  - lib/betslip/*     pure rules (maths, validation, state transitions) — no React
 *  - this hook         glue: React state, the network call, navigation
 *  - the components    rendering only; they receive data and callbacks as props
 */
export function useBetslipForm() {
  const router = useRouter()
  // Passing createInitialDraft as the third argument makes it a lazy
  // initializer: React calls it once on mount rather than on every render.
  const [draft, dispatch] = useReducer(betslipDraftReducer, undefined, createInitialDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Plain arithmetic over a handful of legs, recomputed each render. useMemo
  // would cost more in bookkeeping than it saves.
  const totals = calcBetslipTotals(draft.bets, draft.stake)

  // `dispatch` never changes identity, so these callbacks are stable across
  // renders. That matters for React.memo on child rows: a new function each
  // render would make every row look "changed" and re-render anyway.
  const setField = useCallback(<K extends DetailsField>(field: K, value: BetslipDraft[K]) => {
    // TypeScript can't prove that `value` matches `field` once both are folded
    // into the action union, so the cast lives here, in one place. Callers stay
    // fully checked: setField("stake", true) is still a compile error.
    dispatch({ type: "setField", field, value } as BetslipDraftAction)
  }, [])
  const addBet = useCallback(() => dispatch({ type: "addBet" }), [])
  const removeBet = useCallback((index: number) => dispatch({ type: "removeBet", index }), [])
  const updateBet = useCallback(
    (index: number, field: keyof BetDraft, value: string) =>
      dispatch({ type: "updateBet", index, field, value }),
    []
  )

  const submit = async () => {
    const problem = validateBetslipDraft(draft)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError("")

    const res = await fetch("/api/betslips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toBetslipPayload(draft)),
    })

    if (res.ok) {
      const { betslip } = await res.json()
      router.push(`/betslips/${betslip.id}`)
    } else {
      const body = await res.json()
      setError(body.error ?? "Failed to save")
      setSaving(false)
    }
  }

  return {
    draft,
    totals,
    saving,
    error,
    actions: { setField, addBet, removeBet, updateBet, submit },
  }
}
