import type { Metadata } from "next"
import Link from "next/link"
import { impliedProbability } from "@/lib/devig"
import { americanToDecimal, formatOdds } from "@/lib/utils"

// Line shopping explainer (LAUNCH-PLAN Go-to-market → long-form SEO, the
// "line shopping" search term). The worked example's figures are computed from
// the same tested helpers the no-vig calculator uses, so the arithmetic on the
// page cannot drift from the code. Illustrative prices only — no win rate, ROI,
// record or earnings figure appears here (docs/LAUNCH-PLAN.md copy rules).
export const metadata: Metadata = {
  title: "Line Shopping Explained — Why the Same Bet Pays Differently | IntellaBets",
  description:
    "What line shopping is, how much a better price changes your break-even point, and why a half-point on a spread is a different bet. Worked example with illustrative odds.",
  alternates: { canonical: "https://intellabets.com/line-shopping" },
  openGraph: {
    title: "Line Shopping Explained",
    description:
      "The same bet is priced differently at different sportsbooks. How to compare prices, what it changes, and what it does not.",
    type: "article",
  },
}

/** Illustrative prices for one side of one game at three books. Not a real game. */
const EXAMPLE_PRICES = [
  { book: "Book A", odds: -120 },
  { book: "Book B", odds: -110 },
  { book: "Book C", odds: 100 },
] as const

const STAKE = 100

interface PriceRow {
  book: string
  odds: number
  breakEven: number
  profitIfWin: number
}

/** Break-even win rate and profit on a win, per price — derived, never typed in. */
function buildRows(): PriceRow[] {
  return EXAMPLE_PRICES.map(({ book, odds }) => ({
    book,
    odds,
    breakEven: impliedProbability(odds),
    profitIfWin: (americanToDecimal(odds) - 1) * STAKE,
  }))
}

const percent = (fraction: number) => `${(fraction * 100).toFixed(1)}%`
const dollars = (amount: number) => `$${amount.toFixed(2)}`

export default function LineShoppingPage() {
  const rows = buildRows()
  const worst = rows[0]
  const best = rows[rows.length - 1]

  return (
    <div className="max-w-3xl mx-auto py-10 space-y-10 text-gray-300 text-sm leading-relaxed">
      <div>
        <h1 className="text-3xl font-black text-white mb-2">Line Shopping, Explained</h1>
        <p className="text-gray-500">
          Sportsbooks do not agree on prices. The same bet on the same game can pay noticeably more at one book than
          another. Line shopping just means checking several books and taking the best price available.
        </p>
      </div>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">A worked example</h2>
        <p>
          Here is one side of one game at three books, with a {dollars(STAKE)} stake. These are illustrative prices,
          not a real game.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase">
                <th className="text-left py-2 px-2">Book</th>
                <th className="text-right py-2 px-2">Price</th>
                <th className="text-right py-2 px-2">Profit if it wins</th>
                <th className="text-right py-2 px-2">Break-even win rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.book} className="border-b border-gray-800/50">
                  <td className="py-2 px-2 text-white">{row.book}</td>
                  <td className="py-2 px-2 text-right">{formatOdds(row.odds)}</td>
                  <td className="py-2 px-2 text-right">{dollars(row.profitIfWin)}</td>
                  <td className="py-2 px-2 text-right">{percent(row.breakEven)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          It is the same bet and it wins or loses on the same result. At {formatOdds(best.odds)} a win pays{" "}
          {dollars(best.profitIfWin - worst.profitIfWin)} more than at {formatOdds(worst.odds)}, and the share of
          bets like this you would need to win just to break even drops from {percent(worst.breakEven)} to{" "}
          {percent(best.breakEven)}. Nothing about the game changed — only the price.
        </p>
        <p className="text-xs text-gray-500">
          Break-even win rate is the price&apos;s implied probability: the win rate at which a bet at that price
          neither makes nor loses money over time. It says nothing about whether this particular bet will win.
        </p>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">Spreads and totals: compare the number, not just the price</h2>
        <p>
          On spreads and totals, books can differ on the line itself as well as the price. Team A -3 and Team A -3.5
          are different bets: on -3 a three-point win is a push, on -3.5 it is a loss. Comparing a -110 price on -3
          with a -110 price on -3.5 is not comparing like with like.
        </p>
        <p>
          IntellaBets treats each line number as its own market for exactly this reason — books on -3 are compared
          with other books on -3, never with books on -3.5.
        </p>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">What line shopping does and does not do</h2>
        <ul className="list-disc list-inside space-y-2">
          <li>It makes every bet you were going to place pay more when it wins, and cost less to break even.</li>
          <li>
            It does not make a bet more likely to win. The game is the same at every book; you can still lose any
            bet, and a run of losses is normal even at good prices.
          </li>
          <li>
            The best price at one book is not automatically a good price. A price is only good relative to an
            estimate of the true probability — which is what the{" "}
            <Link href="/devig-calculator" className="text-purple-400 hover:underline">no-vig calculator</Link>{" "}
            and{" "}
            <Link href="/how-it-works" className="text-purple-400 hover:underline">the IntellaBets method</Link>{" "}
            are for.
          </li>
          <li>
            Only use sportsbooks that are licensed where you are. Holding accounts at several of them is what makes
            comparing prices possible.
          </li>
        </ul>
        <p>
          Related: <Link href="/closing-line-value" className="text-purple-400 hover:underline">Closing Line Value explained</Link>,
          which measures whether the prices you took were better than where the market settled.
        </p>
      </section>

      <section className="text-xs text-gray-500 border-t border-gray-800 pt-6 space-y-2">
        <p>
          For informational and entertainment purposes. IntellaBets is not a sportsbook, does not accept wagers and
          does not place bets for you. You must be 21 or older to use this service. Gambling involves risk of loss;
          bet only what you can afford to lose.
        </p>
        <p>
          If gambling is causing you harm, call 1-800-GAMBLER (US, 24/7, confidential) or see our{" "}
          <Link href="/responsible-gambling" className="text-purple-400 hover:underline">responsible gambling resources</Link>.
        </p>
      </section>
    </div>
  )
}
