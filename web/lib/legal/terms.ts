import {
  BRAND,
  DISPUTE_VENUE,
  GOVERNING_STATE,
  HELPLINES,
  LEGAL_ENTITY,
  LIABILITY_CAP_MONTHS,
  MINIMUM_AGE,
  OPERATOR,
  PRICE_CHANGE_NOTICE_DAYS,
  PRICES,
  SITE_HOST,
  SUPPORT_EMAIL_LINK,
} from "./facts"
import { CANCELLATION_ITEMS, REFUND_ITEMS, TIPSTER_EARNINGS_ITEMS } from "./billing"
import type { LegalDocument } from "./types"

/**
 * IntellaBets Terms of Service — the single published version.
 *
 * Replaces both the old in-app page (April 18, 2026) and the standalone
 * legal.intellabets.com page (April 29, 2026), which contradicted each other
 * on governing law, refunds, and minimum age.
 *
 * Prices and the revenue split are interpolated from lib/utils constants via
 * ./facts, so this page always matches /premium and checkout. Cancellation,
 * refund, and payout wording comes from ./billing, shared with /contact.
 */
export const termsOfService: LegalDocument = {
  title: "Terms of Service",
  path: "/terms",
  lastUpdated: "2026-09-29",
  publisher: OPERATOR,
  summary: `The agreement between you and ${BRAND} for using our sports analysis, subscriptions, and tipster marketplace.`,
  preamble: [
    {
      kind: "callout",
      text: `**${BRAND} is not a sportsbook.** We publish sports betting analysis for informational and entertainment purposes. We do not accept wagers, hold funds for betting, or place bets for you, and nothing we publish guarantees any outcome. Betting involves risk, and you can lose money.`,
    },
  ],
  sections: [
    {
      id: "agreement",
      heading: "Agreement to these terms",
      blocks: [
        {
          kind: "paragraph",
          text: `These Terms of Service ("Terms") are a contract between you and ${OPERATOR} ("${BRAND}," "we," "us," or "our"). They apply when you use ${SITE_HOST} or any ${BRAND} mobile app (together, the "Service"). By creating an account or using the Service, you agree to these Terms. If you do not agree, do not use the Service.`,
        },
        {
          kind: "paragraph",
          text: "Our [Privacy Policy](/privacy) explains how we handle your personal information and is part of these Terms.",
        },
      ],
    },
    {
      id: "eligibility",
      heading: "Eligibility",
      blocks: [
        {
          kind: "paragraph",
          text: `You must be at least ${MINIMUM_AGE} years old, or the legal age for sports betting where you live if that is higher, to use the Service. By using the Service, you confirm that you meet this requirement and can enter into this agreement. You are responsible for following the laws that apply to you, including any laws on sports betting. Do not use the Service where doing so is illegal.`,
        },
      ],
    },
    {
      id: "accounts",
      heading: "Your account",
      blocks: [
        {
          kind: "list",
          items: [
            "Give accurate information when you register, and keep it up to date.",
            "One account per person. Creating extra accounts to abuse promotions or evade a suspension is not allowed.",
            "Keep your password confidential. You are responsible for all activity under your account.",
            `Tell us right away at ${SUPPORT_EMAIL_LINK} if you think someone else has accessed your account.`,
          ],
        },
      ],
    },
    {
      id: "the-service",
      heading: "What the Service is, and what it is not",
      blocks: [
        {
          kind: "paragraph",
          text: `${BRAND} compares odds across sportsbooks, removes each book's built-in margin, and highlights where the best available price is better than the market consensus. We also offer AI-generated picks and a marketplace where independent tipsters publish their own picks. [How it works](/how-it-works) explains the method.`,
        },
        {
          kind: "list",
          items: [
            "Our analysis, AI picks, and tipster picks are opinions and information, not financial, investment, or legal advice.",
            "Positive expected value describes an average over many bets. Any single bet can lose, and past results do not predict future results.",
            "Odds in our analysis come from third-party sources and change quickly. Always confirm the price at your sportsbook before you bet.",
            "**AI Picks are written by an AI model that does not receive live odds or schedules.** Games, lines, and odds in an AI pick may be inaccurate or may not exist. Check every detail with your sportsbook.",
            "Tipsters are independent users, not our employees or agents, and they record their own results. We do not endorse their picks or independently verify their results or the statistics calculated from them.",
            "You alone decide whether, where, and how much to bet, and you are responsible for those decisions.",
          ],
        },
      ],
    },
    {
      id: "subscriptions",
      heading: "Subscriptions and billing",
      blocks: [
        {
          kind: "definitions",
          items: [
            {
              term: `Premium Tipster (${PRICES.premium} per month)`,
              text: "publish picks, sell subscriptions to them, and use AI Picks at no extra cost.",
            },
            {
              term: `AI Picks (${PRICES.aiPicks} per month)`,
              text: "AI-generated betslips.",
            },
            {
              term: `Tipster subscriptions (${PRICES.tipsterMin} to ${PRICES.tipsterMax} per month)`,
              text: "access to one tipster's picks, at the price that tipster sets.",
            },
          ],
        },
        {
          kind: "list",
          items: [
            ...CANCELLATION_ITEMS,
            "By subscribing, you authorize us and our payment processor to charge your payment method at each renewal. If you buy through our iOS or Android app, Apple or Google bills you under its own terms.",
            `We may change prices with at least ${PRICE_CHANGE_NOTICE_DAYS} days' notice. A new price applies from your first renewal after the notice period.`,
          ],
        },
      ],
    },
    {
      id: "refunds",
      heading: "Refunds",
      blocks: [
        { kind: "list", items: REFUND_ITEMS },
        {
          kind: "paragraph",
          text: "The same policy, with how to reach us, is on our [Support & Refunds](/contact) page.",
        },
      ],
    },
    {
      id: "tipsters",
      heading: "Tipsters and payouts",
      blocks: [
        {
          kind: "list",
          items: [
            ...TIPSTER_EARNINGS_ITEMS,
            "We may hold earnings or payouts while we investigate suspected fraud, chargebacks, or violations of these Terms.",
            "Tipsters are independent and are not our employees, partners, or agents.",
          ],
        },
      ],
    },
    {
      id: "your-content",
      heading: "Your content",
      blocks: [
        {
          kind: "paragraph",
          text: `You keep ownership of the picks, betslips, and other content you post. By posting, you give ${BRAND} a non-exclusive, worldwide, royalty-free license to host, display, and distribute that content as needed to operate and promote the Service.`,
        },
        {
          kind: "paragraph",
          text: "When you post content, you agree not to:",
        },
        {
          kind: "list",
          items: [
            "Post false, misleading, or manipulated results or performance records.",
            "Guarantee winnings or misrepresent past results.",
            "Infringe anyone's intellectual property or other rights.",
            "Post spam, malware, or abusive, hateful, or harassing content.",
            "Impersonate another person, user, or public figure.",
          ],
        },
        {
          kind: "paragraph",
          text: "We may remove content that breaks these rules, without notice.",
        },
      ],
    },
    {
      id: "acceptable-use",
      heading: "Acceptable use",
      blocks: [
        {
          kind: "paragraph",
          text: "You agree not to:",
        },
        {
          kind: "list",
          items: [
            "Share, resell, or republish paid picks or analysis outside the Service.",
            "Scrape, crawl, or collect data from the Service with automated tools.",
            "Get around paywalls, rate limits, or security measures, or access another user's account.",
            "Copy, reverse engineer, or interfere with the Service or its systems.",
            "Use the Service for anything unlawful.",
          ],
        },
      ],
    },
    {
      id: "intellectual-property",
      heading: "Our intellectual property",
      blocks: [
        {
          kind: "paragraph",
          text: `The Service, including its software, design, analysis, and ${BRAND} name and logo (but not content posted by users), is owned by ${LEGAL_ENTITY} and protected by intellectual property laws. We give you a limited, personal, non-transferable license to use the Service for your own non-commercial purposes while you follow these Terms.`,
        },
      ],
    },
    {
      id: "responsible-gambling",
      heading: "Responsible gambling",
      blocks: [
        {
          kind: "paragraph",
          text: "Only bet what you can afford to lose. If gambling is causing harm to you or someone you know, free and confidential help is available:",
        },
        {
          kind: "list",
          items: [
            `${HELPLINES.ncpg.name}: [ncpgambling.org](${HELPLINES.ncpg.url}) or ${HELPLINES.ncpg.phone} (US, 24/7)`,
            `${HELPLINES.gamblersAnonymous.name}: [gamblersanonymous.org](${HELPLINES.gamblersAnonymous.url})`,
          ],
        },
      ],
    },
    {
      id: "disclaimers",
      heading: "Disclaimers",
      blocks: [
        {
          kind: "paragraph",
          text: 'The Service is provided "as is" and "as available," without warranties of any kind, express or implied, including warranties of merchantability, fitness for a particular purpose, accuracy, and non-infringement. We do not guarantee the accuracy, completeness, or profitability of any analysis, AI pick, or tipster pick, or that the Service will be uninterrupted, error-free, or free of viruses or other harmful components.',
        },
      ],
    },
    {
      id: "limitation-of-liability",
      heading: "Limitation of liability",
      blocks: [
        {
          kind: "paragraph",
          text: `To the fullest extent the law allows, ${BRAND}, ${LEGAL_ENTITY}, and its officers, employees, and affiliates are not liable for any indirect, incidental, special, consequential, or punitive damages, lost profits, or betting losses arising from your use of the Service, including bets placed based on anything published on it. Our total liability for any claim is limited to the amount you paid us in the ${LIABILITY_CAP_MONTHS} months before the claim arose.`,
        },
        {
          kind: "paragraph",
          text: "Some jurisdictions do not allow certain of these limitations, so some may not apply to you.",
        },
      ],
    },
    {
      id: "indemnity",
      heading: "Indemnity",
      blocks: [
        {
          kind: "paragraph",
          text: `You agree to defend and indemnify ${LEGAL_ENTITY} against claims, losses, and costs, including reasonable legal fees, arising from content you post, your misuse of the Service, or your violation of these Terms or of anyone else's rights.`,
        },
      ],
    },
    {
      id: "termination",
      heading: "Suspension and termination",
      blocks: [
        {
          kind: "paragraph",
          text: `We may suspend or close your account if you violate these Terms, commit fraud, or create legal risk for us or other users. You may close your account at any time by emailing ${SUPPORT_EMAIL_LINK}; cancel any active subscriptions first so you are not billed again. If we close your account for a violation, we do not refund the current billing period. Sections that by their nature should survive termination, such as disclaimers, limitation of liability, indemnity, and disputes, continue to apply.`,
        },
      ],
    },
    {
      id: "disputes",
      heading: "Governing law and disputes",
      blocks: [
        {
          kind: "paragraph",
          text: `These Terms are governed by the laws of the State of ${GOVERNING_STATE}, without regard to its conflict-of-law rules. Before filing a claim, please contact us at ${SUPPORT_EMAIL_LINK} so we can try to resolve it informally.`,
        },
        {
          kind: "paragraph",
          text: `Any dispute that is not resolved informally will be decided exclusively by the state or federal courts located in ${DISPUTE_VENUE}, and you and we consent to the personal jurisdiction of those courts. Either of us may instead bring an individual claim in small claims court if it qualifies.`,
        },
      ],
    },
    {
      id: "changes",
      heading: "Changes to these terms",
      blocks: [
        {
          kind: "paragraph",
          text: "We may update these Terms. We will post the new version here and change the date at the top, and for material changes we will notify you by email or with a notice in the Service before they take effect. If you keep using the Service after the changes take effect, you accept the updated Terms. If you do not agree, cancel your subscriptions and stop using the Service.",
        },
      ],
    },
    {
      id: "general",
      heading: "General",
      blocks: [
        {
          kind: "list",
          items: [
            "These Terms and our Privacy Policy are the entire agreement between you and us about the Service.",
            "If any part of these Terms is found unenforceable, the rest stays in effect.",
            "If we do not enforce a provision right away, we do not waive our right to enforce it later.",
            "We may transfer these Terms as part of a merger, acquisition, or sale of assets. You may not transfer them without our written consent.",
          ],
        },
      ],
    },
    {
      id: "contact",
      heading: "Contact us",
      blocks: [
        {
          kind: "paragraph",
          text: `Questions about these Terms: ${SUPPORT_EMAIL_LINK}. ${OPERATOR}.`,
        },
      ],
    },
  ],
}
