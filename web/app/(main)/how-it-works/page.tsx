import type { Metadata } from "next"
import Link from "next/link"

// Method-first marketing copy. No invented win rates, ROI, records, testimonials,
// subscriber counts or earnings, and no guaranteed outcomes — see docs/LAUNCH-PLAN.md.
// This page is the one every other page should link to when explaining the product.
export const metadata: Metadata = {
  title: "How It Works — The De-Vig Method | IntellaBets",
  description:
    "How IntellaBets compares odds across sportsbooks, strips out the bookmaker's margin, and shows you the true market price — explained with a worked example.",
  openGraph: {
    title: "How IntellaBets Works",
    description:
      "We compare every major sportsbook, strip out their margin, and show you where the best available price beats the market's own consensus.",
    type: "article",
  },
}

export default function HowItWorksPage() {
  return (
    <div className="max-w-3xl mx-auto py-10 space-y-10 text-gray-300 text-sm leading-relaxed">
      <div>
        <h1 className="text-3xl font-black text-white mb-2">How IntellaBets Works</h1>
        <p className="text-gray-500">
          We compare every major sportsbook, strip out their margin, and show you where the best
          available price beats the market&apos;s own consensus. That gap is the entire product.
        </p>
      </div>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">The problem: every book&apos;s price includes a fee</h2>
        <p>
          A sportsbook doesn&apos;t quote true odds — it quotes odds with its own margin (the &quot;vig&quot;
          or &quot;overround&quot;) baked in. That margin is how the book makes money regardless of who wins.
          You can see it directly: add up the implied probabilities on both sides of a two-way market
          and, at a real sportsbook, they will sum to more than 100%.
        </p>
        <p>
          For example, a coin-flip game priced at -110 on both sides implies about 52.4% on each side —
          104.8% total. The extra 4.8% is the book&apos;s margin, not information about who is actually
          favored.
        </p>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">De-vigging: removing the margin to see the real number</h2>
        <p>
          &quot;De-vigging&quot; means scaling those implied probabilities back down so they sum to 100% —
          an estimate of the market&apos;s true consensus, with the fee removed. Here&apos;s the arithmetic,
          worked through with illustrative numbers (not a real game or a real result):
        </p>
        <div className="bg-black/30 border border-gray-800 rounded-lg p-4 space-y-2 font-mono text-xs text-gray-400">
          <p>Book quotes: Team A -130 (implied 56.5%), Team B +110 (implied 47.6%)</p>
          <p>Sum of implied probabilities: 56.5% + 47.6% = 104.1% (the extra 4.1% is the vig)</p>
          <p>De-vigged (each side divided by 104.1%): Team A → 54.3%, Team B → 45.7%</p>
          <p>That 54.3% / 45.7% split is our estimate of the market&apos;s true consensus price.</p>
        </div>
        <p>
          We compute this consensus from prices across every book we track, not just one, so a single
          outlier book can&apos;t skew it.
        </p>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">Where the edge comes from: price shopping against that consensus</h2>
        <p>
          Every sportsbook prices the same game slightly differently. Once we know the de-vigged
          consensus, we can see which books are offering a price better than that consensus — and by
          how much. Continuing the example above: if the consensus on Team A is 54.3% (fair odds of
          roughly -119) and one book is still offering Team A at -130, that book is <em>short</em> — you&apos;d
          rather bet Team B there, or find a different book for Team A. If another book offers Team A at
          -105, that&apos;s a price better than the market&apos;s own estimate of fair value.
        </p>
        <p>
          That is what we mean by expected value: not a prediction that a side will win, but a
          statement about price — that you are getting better than the market&apos;s consensus number.
          A positive-EV bet still loses whenever the worse outcome happens; the edge is in the price you
          got, realized over many bets, not in any single one.
        </p>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">Why we don&apos;t publish a win rate</h2>
        <p>
          Almost every competitor in this space leads with a win rate or a return figure. We don&apos;t,
          for two reasons. First, a win rate on its own tells you nothing about whether the underlying
          picks had a real price edge — a coin-flip strategy can run hot for a month and a genuinely
          sharp one can run cold, and neither proves anything over a small sample. Second, this
          business has a specific history: a previous payment processor terminated the account over
          fabricated statistics that used to be published on this site. Those numbers are gone, and we
          aren&apos;t replacing them with new ones until they&apos;re real and the sample is large enough to
          mean something.
        </p>
        <p>
          The honest scoreboard is <strong className="text-white">closing line value (CLV)</strong> —
          whether the price you got, at the time you got it, was better than where the market closed.
          It&apos;s checkable, it doesn&apos;t depend on how any one game turned out, and it&apos;s the number
          sharp bettors actually track. We are accumulating CLV data under corrected settlement logic
          right now. We&apos;re not publishing an average yet because the sample is still too small and too
          new to be meaningful — we&apos;d rather say that plainly than publish a number early and have it
          be wrong in either direction.
        </p>
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="text-lg font-bold text-white">FAQ</h2>
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-white">Is this legal?</p>
            <p>
              Yes. IntellaBets is sports analysis and odds comparison — informational content. We are
              not a sportsbook, we don&apos;t accept wagers, and we never place bets on your behalf.
            </p>
          </div>
          <div>
            <p className="font-semibold text-white">Do you place bets for me?</p>
            <p>
              No. We show you prices and analysis. You place any bet yourself, directly with a licensed
              sportsbook, in a jurisdiction where that&apos;s legal for you. We never ask for or store
              sportsbook login credentials.
            </p>
          </div>
          <div>
            <p className="font-semibold text-white">What if I follow a pick and lose?</p>
            <p>
              You can. A better price and a positive expected value describe the bet at the time you
              made it, not a guarantee about that specific outcome. Any individual bet can lose,
              including ones with a real edge. Nothing on this site is a guaranteed outcome, and no
              subscription is a promise of profit.
            </p>
          </div>
          <div>
            <p className="font-semibold text-white">Why do prices differ between sportsbooks for the same game?</p>
            <p>
              Different books manage their own risk and customer base, and don&apos;t always move their
              lines at the same time or by the same amount. That gap between books is exactly what
              price shopping captures.
            </p>
          </div>
        </div>
      </section>

      <section className="text-xs text-gray-500 border-t border-gray-800 pt-6 space-y-2">
        <p>
          For informational and entertainment purposes. IntellaBets is not a sportsbook and does not
          accept wagers. You must be 18 or older (21 in some jurisdictions) to use this service. Gambling
          involves risk of loss; bet only what you can afford to lose.
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
