import type { Metadata } from "next"
import Link from "next/link"

// CLV explainer. Worked example is illustrative, labeled as such. No live CLV
// average, win rate, ROI or record appears here — the CLV sample is too small
// and too new (see RUNBOOK Known issues). See docs/LAUNCH-PLAN.md copy rules.
export const metadata: Metadata = {
  title: "Closing Line Value (CLV) Explained | IntellaBets",
  description:
    "What closing line value is, how to calculate it with a worked example, and why it is a better scoreboard for betting analysis than win rate.",
  alternates: { canonical: "https://intellabets.com/closing-line-value" },
  openGraph: {
    title: "Closing Line Value (CLV) Explained",
    description:
      "CLV compares the price you got with the price the market closed at. How it works, how to calculate it, and what it can and cannot tell you.",
    type: "article",
  },
}

export default function ClosingLineValuePage() {
  return (
    <div className="max-w-3xl mx-auto py-10 space-y-10 text-gray-300 text-sm leading-relaxed">
      <div>
        <h1 className="text-3xl font-black text-white mb-2">Closing Line Value, Explained</h1>
        <p className="text-gray-500">
          CLV asks one question: was the price you got better than the price the market settled on
          just before the game started? It does not depend on who won.
        </p>
      </div>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">What the closing line is</h2>
        <p>
          Sportsbook prices move as money and information arrive. The last price before the game
          starts, the closing line, reflects the most information the market will ever have. For
          liquid markets it is widely treated as the market&apos;s best estimate of the true
          probability, once the bookmaker&apos;s margin is removed (see{" "}
          <Link href="/how-it-works" className="text-purple-400 hover:underline">
            How it works
          </Link>
          ).
        </p>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">Worked example (illustrative, not a real game)</h2>
        <div className="bg-black/30 border border-gray-800 rounded-lg p-4 space-y-2 font-mono text-xs text-gray-400">
          <p>You take Team A at +120. Implied probability: 100 / (120 + 100) = 45.5%</p>
          <p>The market closes Team A at +100 / -100 after removing the margin: 50.0%</p>
          <p>CLV = closing fair probability - your implied probability = 50.0% - 45.5% = +4.5 points</p>
        </div>
        <p>
          You paid for a 45.5% chance and the market later valued it at 50.0%. That is positive
          CLV: you got a better price than the close. Had the line moved the other way, the same
          calculation would be negative. These numbers are made up to show the arithmetic.
        </p>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">Why it is a better scoreboard than win rate</h2>
        <p>
          Win rate over a few dozen bets is mostly noise. A positive-expected-value bet loses often,
          and a bad-priced bet can win. CLV measures the decision (the price) rather than the
          outcome (the result), so it converges faster and cannot be flattered by a lucky week.
        </p>
        <p>
          Positive expected value is a statement about price, not a prediction that a bet wins.
        </p>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">What CLV cannot tell you</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>It does not guarantee profit. Positive CLV is evidence of price quality, not a promise of results.</li>
          <li>It needs a large sample before an average means anything, and it is only as good as the closing prices recorded.</li>
          <li>Closing lines on thin markets (some props, small leagues) are less reliable estimates of true probability.</li>
          <li>Sportsbooks can limit or close accounts that consistently beat the close. That is a practical consideration, outside our control.</li>
        </ul>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">Where we stand on our own CLV</h2>
        <p>
          We track CLV on the picks we publish. We are not publishing an average yet: our settlement
          logic was corrected recently, and the sample under the corrected logic is too small to
          mean anything. We will publish it once it is large enough, with the sample size next to it.
        </p>
      </section>

      <section className="text-xs text-gray-500 border-t border-gray-800 pt-6 space-y-2">
        <p>
          For informational and entertainment purposes. IntellaBets is not a sportsbook and does not
          accept wagers. You must be 18 or older (21 in some jurisdictions) to use this service.
          Gambling involves risk of loss; bet only what you can afford to lose.
        </p>
        <p>
          If gambling is causing you harm, help is available at{" "}
          <a
            href="https://www.ncpgambling.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:underline"
          >
            ncpgambling.org
          </a>{" "}
          or 1-800-522-4700 (US, 24/7, confidential).
        </p>
      </section>
    </div>
  )
}
