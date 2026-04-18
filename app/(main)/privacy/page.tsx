import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy — IntellaBets",
}

export default function PrivacyPage() {
  const updated = "April 18, 2026"
  return (
    <div className="max-w-3xl mx-auto py-10 space-y-8 text-gray-300 text-sm leading-relaxed">
      <div>
        <h1 className="text-3xl font-black text-white mb-2">Privacy Policy</h1>
        <p className="text-gray-500">Last updated: {updated}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">1. Who We Are</h2>
        <p>
          IntellaBets (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) operates the IntellaBets platform — a sports analytics
          and tipster community available at intellabets.com and via our mobile apps. This policy explains how
          we collect, use, and protect your personal information.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">2. Information We Collect</h2>
        <ul className="list-disc list-inside space-y-2 ml-2">
          <li><strong className="text-white">Account data:</strong> name, email address, username, and encrypted password when you register.</li>
          <li><strong className="text-white">Profile data:</strong> bio, sports specialties, subscription price, and performance statistics you choose to provide.</li>
          <li><strong className="text-white">Content:</strong> betslips and picks you create or purchase access to.</li>
          <li><strong className="text-white">Payment data:</strong> payments are processed by Stripe (web), Apple In-App Purchase (iOS), or Google Play Billing (Android). We do not store full card numbers. We receive transaction identifiers and subscription status from these processors.</li>
          <li><strong className="text-white">Usage data:</strong> pages viewed, features used, IP address, browser/device type, and timestamps — collected via server logs.</li>
          <li><strong className="text-white">Communications:</strong> support requests or emails you send us.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">3. How We Use Your Information</h2>
        <ul className="list-disc list-inside space-y-2 ml-2">
          <li>Provide, operate, and improve the IntellaBets platform.</li>
          <li>Process subscriptions and tipster payouts.</li>
          <li>Generate AI-powered predictions via the Anthropic Claude API (your sport/bet-type preferences are sent; no identifying account data is sent to Anthropic).</li>
          <li>Display win rates, leaderboards, and public profile statistics.</li>
          <li>Send transactional emails (subscription confirmations, payout notices).</li>
          <li>Investigate fraud, enforce our Terms, and comply with legal obligations.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">4. Third-Party Services</h2>
        <div className="space-y-2">
          <p><strong className="text-white">Stripe</strong> — web payment processing. Governed by the <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">Stripe Privacy Policy</a>.</p>
          <p><strong className="text-white">Apple / Google</strong> — in-app purchase processing on mobile. Governed by Apple&apos;s and Google&apos;s respective privacy policies.</p>
          <p><strong className="text-white">RevenueCat</strong> — mobile subscription management. Governed by the <a href="https://www.revenuecat.com/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">RevenueCat Privacy Policy</a>.</p>
          <p><strong className="text-white">Anthropic</strong> — AI pick generation. No personally identifiable information is shared. Governed by the <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">Anthropic Privacy Policy</a>.</p>
          <p><strong className="text-white">Vercel</strong> — hosting provider. Governed by the <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">Vercel Privacy Policy</a>.</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">5. Data Sharing</h2>
        <p>
          We do not sell your personal information. We share data only as described in Section 4 (service
          providers), when required by law, or to protect the rights and safety of IntellaBets and its users.
          Public profile data (username, win rate, betslips marked public) is visible to all users by design.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">6. Data Retention</h2>
        <p>
          We retain account data for as long as your account is active or as needed to provide services.
          You may request deletion of your account and associated data by emailing support@intellabets.com.
          We may retain certain records for legal or financial compliance purposes.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">7. Your Rights</h2>
        <p>Depending on your jurisdiction, you may have rights to access, correct, delete, or export your personal data. To exercise these rights, contact us at <a href="mailto:support@intellabets.com" className="text-purple-400 hover:underline">support@intellabets.com</a>.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">8. Security</h2>
        <p>
          We use industry-standard security measures including password hashing (bcrypt), HTTPS encryption,
          and restricted database access. No system is perfectly secure; we cannot guarantee absolute security.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">9. Age Restriction</h2>
        <p>
          IntellaBets is intended solely for users aged 18 or older. We do not knowingly collect personal
          information from individuals under 18. If you believe a minor has created an account, contact us
          and we will delete it promptly.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">10. Changes to This Policy</h2>
        <p>
          We may update this policy periodically. We will notify you of material changes by email or prominent
          in-app notice. Continued use of the platform after changes constitutes acceptance.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">11. Contact</h2>
        <p>
          Questions or concerns? Email us at{" "}
          <a href="mailto:support@intellabets.com" className="text-purple-400 hover:underline">
            support@intellabets.com
          </a>
        </p>
      </section>
    </div>
  )
}
