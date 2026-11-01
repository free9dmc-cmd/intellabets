"use client"

import { useMemo, useState } from "react"
import { devigMarket, expectedValuePerUnit, isValidAmericanOdds } from "@/lib/devig"
import { formatOdds } from "@/lib/utils"

const MIN_OUTCOMES = 2
const MAX_OUTCOMES = 3

// Starting values are a plain -110/-110 line so the result is easy to check
// by hand (50% each, 4.8% margin). They are not a real game.
const DEFAULT_PRICES = ["-110", "-110"]

interface PriceInputProps {
  label: string
  value: string
  onChange: (value: string) => void
}

function PriceInput({ label, value, onChange }: PriceInputProps) {
  const parsed = Number(value)
  const invalid = value.trim() !== "" && !isValidAmericanOdds(parsed)
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-400 mb-1.5">{label}</span>
      <input
        inputMode="numeric"
        className="input-dark"
        placeholder="-110"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
      />
      {invalid && <span className="block text-xs text-red-400 mt-1">American odds are -100 or lower, or +100 or higher.</span>}
    </label>
  )
}

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`
}

/**
 * Interactive de-vig calculator: one book's prices in, fair (no-vig)
 * probabilities and prices out. Optional "price elsewhere" shows the expected
 * value of a different book's price against those fair probabilities.
 */
export default function DevigCalculator() {
  const [prices, setPrices] = useState<string[]>(DEFAULT_PRICES)
  const [comparePrice, setComparePrice] = useState("")

  const result = useMemo(() => devigMarket(prices.map(Number)), [prices])

  const updatePrice = (index: number, value: string) =>
    setPrices((current) => current.map((p, i) => (i === index ? value : p)))

  const setOutcomeCount = (count: number) =>
    setPrices((current) => (count > current.length ? [...current, ""] : current.slice(0, count)))

  const compareOdds = Number(comparePrice)
  const showCompare = result !== null && comparePrice.trim() !== "" && isValidAmericanOdds(compareOdds)

  return (
    <div className="card p-6 space-y-6">
      <div className="flex gap-2" role="group" aria-label="Number of outcomes">
        {[MIN_OUTCOMES, MAX_OUTCOMES].map((count) => (
          <button
            key={count}
            type="button"
            onClick={() => setOutcomeCount(count)}
            aria-pressed={prices.length === count}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              prices.length === count
                ? "border-purple-500 text-white bg-purple-500/10"
                : "border-gray-700 text-gray-400 hover:text-white"
            }`}
          >
            {count === 2 ? "2-way (moneyline, spread, total)" : "3-way (soccer 1X2)"}
          </button>
        ))}
      </div>

      <div className={`grid gap-4 ${prices.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {prices.map((value, i) => (
          <PriceInput key={i} label={`Outcome ${i + 1} price (one book)`} value={value} onChange={(v) => updatePrice(i, v)} />
        ))}
      </div>

      {result === null ? (
        <p className="text-xs text-gray-500">
          Enter every outcome&apos;s price from the same sportsbook. Prices from different books, or a set with no
          margin in it, cannot be de-vigged this way.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-300">
            Book margin (overround): <strong className="text-white">{percent(result.margin)}</strong>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase">
                  <th className="text-left py-2 px-2">Outcome</th>
                  <th className="text-right py-2 px-2">Book price</th>
                  <th className="text-right py-2 px-2">Implied (with vig)</th>
                  <th className="text-right py-2 px-2">Fair probability</th>
                  <th className="text-right py-2 px-2">Fair price</th>
                </tr>
              </thead>
              <tbody>
                {result.outcomes.map((o, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    <td className="py-2 px-2 text-white">Outcome {i + 1}</td>
                    <td className="py-2 px-2 text-right">{formatOdds(o.americanOdds)}</td>
                    <td className="py-2 px-2 text-right">{percent(o.impliedProbability)}</td>
                    <td className="py-2 px-2 text-right text-white font-semibold">{percent(o.fairProbability)}</td>
                    <td className="py-2 px-2 text-right">{formatOdds(o.fairAmericanOdds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-800 pt-4 space-y-2">
            <PriceInput
              label="Optional: a price for outcome 1 at a different book"
              value={comparePrice}
              onChange={setComparePrice}
            />
            {showCompare && (
              <p className="text-sm text-gray-300">
                Against a fair probability of {percent(result.outcomes[0].fairProbability)}, {formatOdds(compareOdds)} has an
                expected value of{" "}
                <strong className="text-white">
                  {(expectedValuePerUnit(result.outcomes[0].fairProbability, compareOdds) * 100).toFixed(1)}%
                </strong>{" "}
                per unit staked. That describes the price, not the result: a positive number does not mean the bet
                will win.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
