import type { Metadata } from "next"
import Link from "next/link"

// Method-first explainer. Every number below is an illustrative worked example,
// labeled as such. No live CLV average, win rate, ROI, record, testimonial or
// income claim belongs on this page — see docs/LAUNCH-PLAN.md.
export const metadata: Metadata = {
  title: "Closing Line Value (CLV) Explained | IntellaBets",
  description:
    "What closing line value is, how to calculate it with a worked example, and why it is a better scoreboard than win rate over a small sample.",
  openGraph: {
    title: "Closing Line Value (CLV) Explained",
    description:
      "CLV compares the price you got with where the market closed. A worked example, and why it matters more than a short run of wins.",
    type: "article",
  },
}

export default function ClvPage() {
  return (
    <div className="max-w-3xl mx-auto py-10 space-y-10 text-gray-300 text-sm leading-relaxed">
      <div>
        <h1 className="text-3xl font-black text-white mb-2">Closing Line Value (CLV), Explained</h1>
        <p className="text-gray-500">
          CLV asks one question: was the price you got better or worse than where the market ended
          up? It is a statement about price, not about whether a bet won.
        </p>
      </div>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">What is the closing line?</h2>
        <p>
          The closing line is the final price on a market just before the game starts. By then the
          market has absorbed injury news, lineup changes, and money from many bettors, so it is
          generally the most informed estimate of the true probability available. That is a general
          property of liquid markets, not a promise about any particular game.
        </p>
        <p>
          We de-vig the closing prices (see{" "}
          <Link href="/how-it-works" className="text-purple-400 hover:underline">How It Works</Link>)
          so the comparison is between probabilities with the bookmaker&apos;s margin removed, not
          between raw odds.
        </p>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">Worked example: positive CLV</h2>
        <p>Illustrative numbers only — not a real game and not a real result:</p>
        <div className="bg-black/30 border border-gray-800 rounded-lg p-4 space-y-2 font-mono text-xs text-gray-400">
          <p>You take Team A at +110. Implied probability: 100 / (110 + 100) = 47.6%</p>
          <p>Market closes at -105 on both sides. De-vigged, each side is 50.0% (fair odds about +100).</p>
          <p>CLV = closing probability − your entry probability = 50.0% − 47.6% = +2.4 points</p>
        </div>
        <p>
          You paid a price implying 47.6% for something the closing market valued at 50.0%. You got
          a better price than the market&apos;s final consensus. Team A can still lose the game. Positive
          CLV says the price was good, not that the bet won.
        </p>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">Worked example: negative CLV</h2>
        <div className="bg-black/30 border border-gray-800 rounded-lg p-4 space-y-2 font-mono text-xs text-gray-400">
          <p>You take Team B at -120. Implied probability: 120 / (120 + 100) = 54.5%</p>
          <p>The market drifts and closes with Team B at a de-vigged 52.0%.</p>
          <p>CLV = 52.0% − 54.5% = −2.5 points</p>
        </div>
        <p>
          You paid more than the closing market thought the side was worth. Team B can still win, but
          over many bets, consistently paying above the closing price is a losing habit.
        </p>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">Why CLV instead of win rate?</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-white">It does not depend on how one game ended.</strong> A win
            rate over a few dozen bets is mostly noise; CLV is measured the moment the market closes.
          </li>
          <li>
            <strong className="text-white">It converges faster.</strong> Because it measures price
            rather than outcome, a meaningful signal needs fewer bets than a win-rate or return figure
            does — though it still needs a real sample.
          </li>
          <li>
            <strong className="text-white">It can be checked.</strong> Entry price, closing price and
            the de-vig arithmetic are all inspectable.
          </li>
        </ul>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">Limits — read these</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Positive CLV is evidence about price quality. It does not guarantee profit, and no individual bet is guaranteed to win.</li>
          <li>The closing line is an estimate of true probability, not the truth. Markets can be wrong.</li>
          <li>Small samples mislead in both directions. A short run of positive or negative CLV means little.</li>
          <li>
            <strong className="text-white">We are not publishing a CLV average yet.</strong> We corrected
            how games are settled, and earlier records were affected. We are collecting a clean sample
            under the corrected logic and will publish results only once it is large enough to mean
            something — and only from real settled data.
          </li>
        </ul>
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
        <p>
          See also our <Link href="/terms" className="text-purple-400 hover:underline">Terms</Link> and{" "}
          <Link href="/privacy" className="text-purple-400 hover:underline">Privacy Policy</Link>.
        </p>
      </section>
    </div>
  )
}
