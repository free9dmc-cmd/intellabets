import type { Metadata } from "next"
import Link from "next/link"
import DevigCalculator from "@/components/DevigCalculator"

// Public de-vig calculator (LAUNCH-PLAN Go-to-market → long-form SEO, the
// "de-vig calculator" search term). The maths lives in lib/devig.ts and mirrors
// the engine's proportional method. No win rate, ROI, record or earnings figure
// appears on this page — see docs/LAUNCH-PLAN.md copy rules.
export const metadata: Metadata = {
  title: "No-Vig (De-Vig) Calculator — Fair Odds & Bookmaker Margin | IntellaBets",
  description:
    "Free no-vig calculator. Enter one sportsbook's prices to see its margin, the fair (de-vigged) probability of each outcome, and the no-vig price. Works for 2-way and 3-way markets.",
  alternates: { canonical: "https://intellabets.com/devig-calculator" },
  openGraph: {
    title: "No-Vig (De-Vig) Calculator",
    description:
      "See a sportsbook's margin and the fair odds underneath it. 2-way and 3-way markets, proportional method.",
    type: "website",
  },
}

export default function DevigCalculatorPage() {
  return (
    <div className="max-w-3xl mx-auto py-10 space-y-10 text-gray-300 text-sm leading-relaxed">
      <div>
        <h1 className="text-3xl font-black text-white mb-2">No-Vig Calculator</h1>
        <p className="text-gray-500">
          Enter one sportsbook&apos;s prices for every outcome of a market. The calculator shows how much margin the
          book has built in, and what each price would be with that margin removed.
        </p>
      </div>

      <DevigCalculator />

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">How the calculation works</h2>
        <ol className="list-decimal list-inside space-y-2">
          <li>
            Each price becomes an implied probability. For American odds of -150 that is 150 / (150 + 100) = 60%;
            for +130 it is 100 / (130 + 100) = 43.5%.
          </li>
          <li>
            The implied probabilities add up to more than 100% (here 103.5%). The extra is the book&apos;s margin,
            also called the vig, juice or overround.
          </li>
          <li>
            Dividing each implied probability by that total scales them back to 100%: 60 / 103.5 = 58.0% and
            43.5 / 103.5 = 42.0%. Those are the fair, or no-vig, probabilities.
          </li>
        </ol>
        <p className="text-xs text-gray-500">
          Illustrative numbers, not a real game. This is the proportional (multiplicative) method — the same one
          the IntellaBets engine uses. Other methods (power, Shin) shift a little more of the margin onto
          longshots and give slightly different answers on lopsided markets.
        </p>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">What it can and cannot tell you</h2>
        <p>
          A fair probability from one book is that book&apos;s opinion with its fee taken out. It is not a
          forecast, and one book can simply be wrong. That is why IntellaBets averages the de-vigged prices of
          every book it tracks into a consensus, and only flags a price when it beats that consensus.
        </p>
        <p>
          The optional comparison box shows the expected value of another book&apos;s price against the fair
          probability. Positive expected value is a statement about the price. Any single bet can still lose,
          and no calculator or service can guarantee a profit.
        </p>
        <p>
          More on the method: <Link href="/how-it-works" className="text-purple-400 hover:underline">How it works</Link>,{" "}
          <Link href="/line-shopping" className="text-purple-400 hover:underline">Line shopping explained</Link>{" "}
          and <Link href="/closing-line-value" className="text-purple-400 hover:underline">Closing Line Value explained</Link>.
        </p>
      </section>

      <section className="text-xs text-gray-500 border-t border-gray-800 pt-6 space-y-2">
        <p>
          For informational and entertainment purposes. IntellaBets is not a sportsbook and does not accept
          wagers. You must be 21 or older to use this service. Gambling involves risk of loss; bet only what you
          can afford to lose.
        </p>
        <p>
          If gambling is causing you harm, call 1-800-GAMBLER (US, 24/7, confidential) or see our{" "}
          <Link href="/responsible-gambling" className="text-purple-400 hover:underline">responsible gambling resources</Link>.
        </p>
      </section>
    </div>
  )
}
