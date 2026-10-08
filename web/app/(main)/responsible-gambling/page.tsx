import type { Metadata } from "next"
import Link from "next/link"

// Dedicated responsible gambling page. Contains no performance figures of any
// kind. Resource list limited to well-known national services; verify contact
// details periodically. See docs/LAUNCH-PLAN.md copy rules.
export const metadata: Metadata = {
  title: "Responsible Gambling | IntellaBets",
  description:
    "IntellaBets is an analytics service, not a sportsbook. Guidance on staying in control, warning signs, and where to get free, confidential help.",
  alternates: { canonical: "https://intellabets.com/responsible-gambling" },
}

export default function ResponsibleGamblingPage() {
  return (
    <div className="max-w-3xl mx-auto py-10 space-y-8 text-gray-300 text-sm leading-relaxed">
      <div>
        <h1 className="text-3xl font-black text-white mb-2">Responsible Gambling</h1>
        <p className="text-gray-500">
          You must be 18 or older (21 in some jurisdictions) to use IntellaBets. Gambling involves
          risk of loss, and nothing on this site guarantees any outcome.
        </p>
      </div>

      <section className="card p-6 space-y-3">
        <h2 className="text-lg font-bold text-white">What we are, and are not</h2>
        <p>
          IntellaBets publishes odds comparison and analysis. We are not a sportsbook, we do not
          accept wagers, and we never ask for your sportsbook login or place bets for you.
        </p>
        <p>
          A price being good (positive expected value) is a statement about price, not about
          whether a given bet wins. Any single bet can lose, and a run of losses is normal even
          when the prices were good. See{" "}
          <Link href="/how-it-works" className="text-purple-400 hover:underline">
            How it works
          </Link>
          .
        </p>
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="text-lg font-bold text-white">Staying in control</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Only bet money you can afford to lose. Never bet rent, bills, or borrowed money.</li>
          <li>Set a budget and a time limit before you start, and keep to them.</li>
          <li>Do not chase losses. Losing does not mean a win is &quot;due&quot;.</li>
          <li>Use the deposit limits, time-outs and self-exclusion tools your sportsbook offers.</li>
          <li>Treat betting as entertainment, not income.</li>
          <li>Avoid betting when upset, stressed, or under the influence.</li>
        </ul>
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="text-lg font-bold text-white">Signs gambling may be a problem</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Betting more than you planned, or for longer than you planned</li>
          <li>Hiding your betting from family or friends</li>
          <li>Borrowing money or selling things to bet</li>
          <li>Feeling anxious, irritable or guilty about gambling</li>
          <li>Trying to win back losses with bigger bets</li>
          <li>Neglecting work, study or relationships</li>
        </ul>
        <p>If any of these sound familiar, please stop and talk to someone.</p>
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="text-lg font-bold text-white">Free, confidential help</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            US: National Council on Problem Gambling,{" "}
            <a
              href="https://www.ncpgambling.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:underline"
            >
              ncpgambling.org
            </a>
            , 1-800-522-4700 (24/7), or text 800GAM
          </li>
          <li>
            Gamblers Anonymous:{" "}
            <a
              href="https://www.gamblersanonymous.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:underline"
            >
              gamblersanonymous.org
            </a>
          </li>
          <li>
            UK: GamCare,{" "}
            <a
              href="https://www.gamcare.org.uk"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:underline"
            >
              gamcare.org.uk
            </a>
            , 0808 8020 133
          </li>
        </ul>
        <p>
          For self-exclusion from betting in your state, contact your state gaming regulator or
          your sportsbook directly.
        </p>
      </section>

      <section className="text-xs text-gray-500 border-t border-gray-800 pt-6">
        <p>
          Questions? See{" "}
          <Link href="/contact" className="text-purple-400 hover:underline">
            Contact
          </Link>
          . For informational and entertainment purposes only.
        </p>
      </section>
    </div>
  )
}
