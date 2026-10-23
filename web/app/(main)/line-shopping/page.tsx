import type { Metadata } from "next"
import Link from "next/link"

// Line shopping explainer. Worked example is illustrative, labeled as such. No
// win rate, ROI, record or testimonial appears here. See docs/LAUNCH-PLAN.md copy rules.
export const metadata: Metadata = {
  title: "Line Shopping Explained | IntellaBets",
  description:
    "What line shopping is, why the same bet can cost different amounts at different sportsbooks, and how to compare prices with a worked example.",
  alternates: { canonical: "https://intellabets.com/line-shopping" },
  openGraph: {
    title: "Line Shopping Explained",
    description:
      "The same bet is priced differently across sportsbooks. How comparing prices works and what it can and cannot do for you.",
    type: "article",
  },
}

export default function LineShoppingPage() {
  return (
    <div className="max-w-3xl mx-auto py-10 space-y-10 text-gray-300 text-sm leading-relaxed">
      <div>
        <h1 className="text-3xl font-black text-white mb-2">Line Shopping, Explained</h1>
        <p className="text-gray-500">
          Sportsbooks do not agree on prices. Line shopping means checking several of them before
          you bet, and taking the best price on offer.
        </p>
      </div>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">Why prices differ</h2>
        <p>
          Each sportsbook sets its own odds, adjusts them for its own customers&apos; betting, and
          builds in its own margin (see{" "}
          <Link href="/how-it-works" className="text-purple-400 hover:underline">
            How it works
          </Link>
          ). Two books can offer the same side of the same game at different prices at the same
          moment.
        </p>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">Worked example (illustrative, not a real game)</h2>
        <div className="bg-black/30 border border-gray-800 rounded-lg p-4 space-y-2 font-mono text-xs text-gray-400">
          <p>Book A offers Team A at +110. Implied probability: 100 / (110 + 100) = 47.6%</p>
          <p>Book B offers Team A at +120. Implied probability: 100 / (120 + 100) = 45.5%</p>
          <p>A $100 bet that wins pays $110 at Book A or $120 at Book B.</p>
        </div>
        <p>
          Same team, same game, same outcome required. Book B charges less for it, by about 2.1
          percentage points of implied probability. Repeated over many bets, taking the better
          price each time is a lower cost of betting. These numbers are made up to show the
          arithmetic.
        </p>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">How this connects to expected value</h2>
        <p>
          A bet has positive expected value when the price is better than the true probability of
          the outcome justifies. Comparing many books shows where one price sits away from the
          market consensus, which is what IntellaBets surfaces. Positive expected value is a
          statement about price, not a prediction that a bet wins.
        </p>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">What line shopping cannot do</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>It does not guarantee profit. A better price improves the odds you are paid, not the chance the bet wins.</li>
          <li>It needs accounts at multiple licensed sportsbooks, and availability depends on your state.</li>
          <li>Prices move. A price you see may be gone by the time you place the bet.</li>
          <li>Sportsbooks may limit accounts at their discretion.</li>
        </ul>
        <p>
          IntellaBets does not take wagers, does not hold sportsbook logins and does not place bets
          for you. You compare, and you decide.
        </p>
      </section>

      <section className="text-xs text-gray-500 border-t border-gray-800 pt-6 space-y-2">
        <p>
          For informational and entertainment purposes. IntellaBets is not a sportsbook and does not
          accept wagers. You must be 21 or older to use this service.
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
