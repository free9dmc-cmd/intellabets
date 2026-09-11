import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contact & Support — IntellaBets",
  description: "Get help with your IntellaBets account, billing, or subscription.",
}

// Card networks require a merchant to publish reachable contact details and a
// clear refund policy. Burying them in the Terms is not sufficient — payment
// underwriters look for a dedicated, linkable page.
export default function ContactPage() {
  return (
    <div className="max-w-3xl mx-auto py-10 space-y-8 text-gray-300 text-sm leading-relaxed">
      <div>
        <h1 className="text-3xl font-black text-white mb-2">Contact &amp; Support</h1>
        <p className="text-gray-500">We aim to respond to every message within 2 business days.</p>
      </div>

      <section className="card p-6 space-y-3">
        <h2 className="text-lg font-bold text-white">Get in touch</h2>
        <p>
          <strong className="text-white">Support &amp; billing:</strong>{" "}
          <a href="mailto:support@intellabets.com" className="text-purple-400 hover:underline">
            support@intellabets.com
          </a>
        </p>
        <p className="text-gray-400">
          Please include the email address on your account so we can find you quickly. Never send
          your password — we will never ask for it.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">Billing &amp; refund policy</h2>
        <ul className="list-disc list-inside space-y-2 ml-2">
          <li>
            <strong className="text-white">All subscriptions renew automatically</strong> each month
            at the price shown at checkout, until you cancel.
          </li>
          <li>
            <strong className="text-white">Cancel any time</strong> from your account settings.
            Cancellation stops future billing and takes effect at the end of the period you have
            already paid for — you keep access until then.
          </li>
          <li>
            <strong className="text-white">Refunds:</strong> if you were charged in error, charged
            after cancelling, or could not access what you paid for, email us within{" "}
            <strong className="text-white">30 days</strong> of the charge and we will refund it in
            full.
          </li>
          <li>
            Because picks and analysis are delivered immediately, we do not otherwise refund a
            billing period that has already been used — but if something has gone wrong, contact us
            and we will make it right.
          </li>
          <li>
            Purchases made inside our iOS or Android app are billed by Apple or Google. Those
            refunds must be requested through Apple or Google directly, under their policies.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">Tipster payouts</h2>
        <p>
          Tipsters keep 80% of what their subscribers pay; IntellaBets retains a 20% platform fee.
          Payouts are made to your connected payout account once your available balance reaches the
          minimum shown on your payouts page. You are responsible for any taxes owed on your
          earnings.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">Responsible gambling</h2>
        <p>
          IntellaBets sells sports analysis for informational purposes. We are not a sportsbook, we
          do not accept wagers, and nothing here is a guarantee of any outcome. You must be 18 or
          older to use this service.
        </p>
        <p>
          If gambling is causing you harm, help is available:{" "}
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
    </div>
  )
}
