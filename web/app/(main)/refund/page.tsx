import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy — IntellaBets",
  description: "How IntellaBets subscription billing, cancellations, and refunds work.",
}

export default function RefundPage() {
  const updated = "September 25, 2026"
  return (
    <div className="max-w-3xl mx-auto py-10 space-y-8 text-gray-300 text-sm leading-relaxed">
      <div>
        <h1 className="text-3xl font-black text-white mb-2">Refund &amp; Cancellation Policy</h1>
        <p className="text-gray-500">Last updated: {updated}</p>
      </div>

      <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-sm">
        <strong>Important:</strong> IntellaBets sells sports analytics and tipster picks for informational
        and entertainment purposes only. We are not a sportsbook, do not accept bets, and are not responsible
        for any wagering decisions you make. You must be 18 or older to use this service. Please gamble
        responsibly.
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">1. Automatic renewal</h2>
        <p>
          All IntellaBets subscriptions renew automatically each month at the price shown at checkout,
          until you cancel. This applies to Premium Tipster ($19.99/mo), AI Picks ($9.99/mo), and
          individual tipster subscriptions ($4.99–$49.99/mo).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">2. Cancelling</h2>
        <p>
          You can cancel any time from your account settings. Cancellation stops future billing and takes
          effect at the end of the period you have already paid for — you keep access until then. We do not
          issue partial refunds for the unused remainder of a period you chose to cancel.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">3. Refunds</h2>
        <ul className="list-disc list-inside space-y-2 ml-2">
          <li>
            If you were charged in error, charged more than once for the same period, charged after
            cancelling, or were unable to access what you paid for, email{" "}
            <a href="mailto:support@intellabets.com" className="text-purple-400 hover:underline">
              support@intellabets.com
            </a>{" "}
            within <strong className="text-white">30 days</strong> of the charge and we will refund it in
            full.
          </li>
          <li>
            Because picks and analysis are delivered immediately, we do not otherwise refund a billing
            period that has already been used — but if something has gone wrong, contact us and we will
            make it right.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">4. Price changes</h2>
        <p>
          We may change subscription prices with at least 30 days&apos; notice before the change takes
          effect. The new price applies to renewals after that notice period; you may cancel before then if
          you do not wish to continue.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">5. Purchases made in our mobile apps</h2>
        <p>
          Purchases made inside our iOS or Android app are billed by Apple or Google, not by IntellaBets.
          Refunds for those must be requested through Apple or Google directly, under their respective
          policies.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">6. Responsible gambling</h2>
        <p>
          IntellaBets promotes responsible gambling. If you or someone you know has a gambling problem,
          help is available:{" "}
          <a
            href="https://www.ncpgambling.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:underline"
          >
            ncpgambling.org
          </a>{" "}
          or call 1-800-522-4700 (US, 24/7, confidential).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">7. Contact</h2>
        <p>
          Questions about billing or a refund? Email{" "}
          <a href="mailto:support@intellabets.com" className="text-purple-400 hover:underline">
            support@intellabets.com
          </a>
          . Please include the email address on your account so we can find you quickly.
        </p>
      </section>
    </div>
  )
}
