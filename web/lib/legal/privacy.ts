import {
  BRAND,
  DELETION_COMPLETION_DAYS,
  MINIMUM_AGE,
  OPERATOR,
  PRIVACY_REQUEST_RESPONSE_DAYS,
  SITE_HOST,
  SUPPORT_EMAIL_LINK,
} from "./facts"
import type { LegalDocument } from "./types"

/**
 * IntellaBets Privacy Policy — the single published version.
 *
 * Replaces both the old in-app page (April 18, 2026) and the standalone
 * legal.intellabets.com page (April 29, 2026), which contradicted each other.
 *
 * ACCURACY RULE: every statement here must be true of the code as deployed.
 * If you add a service that touches personal data (analytics, email, error
 * monitoring, a new payment processor), update "service-providers" in the
 * same pull request, and bump `lastUpdated`.
 */
export const privacyPolicy: LegalDocument = {
  title: "Privacy Policy",
  path: "/privacy",
  lastUpdated: "2026-09-29",
  publisher: OPERATOR,
  summary: `What personal information ${BRAND} collects, how we use it, who we share it with, and the choices you have.`,
  sections: [
    {
      id: "who-we-are",
      heading: "Who we are",
      blocks: [
        {
          kind: "paragraph",
          text: `${BRAND} is operated by ${OPERATOR} ("${BRAND}," "we," "us," or "our"). This policy explains how we handle personal information when you use ${SITE_HOST} or any ${BRAND} mobile app (together, the "Service").`,
        },
        {
          kind: "paragraph",
          text: `${BRAND} publishes sports betting analysis. We are not a sportsbook: we do not accept wagers, hold funds for betting, or place bets for you.`,
        },
      ],
    },
    {
      id: "information-we-collect",
      heading: "Information we collect",
      blocks: [
        {
          kind: "definitions",
          items: [
            {
              term: "Account information",
              text: "your name, email address, username, and password. Passwords are stored only as a one-way hash, so we cannot read them.",
            },
            {
              term: "Profile information",
              text: "anything you choose to add: a bio, the sports you specialize in, and, if you are a tipster, your subscription price.",
            },
            {
              term: "Picks and performance",
              text: "betslips you create or publish, their results, and statistics we calculate from them, such as win rate and return on investment.",
            },
            {
              term: "Bet tracking",
              text: "if you use the bet tracker, the bets you record: the game, sportsbook, selection, odds, stake, and result. We store what you enter; we never connect to or sign in to your sportsbook account.",
            },
            {
              term: "Purchase information",
              text: "your plan, subscription status, renewal dates, and transaction identifiers from our payment processor or app store. We never receive or store your full card number.",
            },
            {
              term: "Tipster payout information",
              text: "your earnings and any payout requests. Payouts are not available yet. When they launch, identity and bank verification will be handled directly by our payout provider, and we will keep only a reference to that account and its status.",
            },
            {
              term: "Support conversations",
              text: "messages you send us through the support chat or by email, and the support tickets created from them.",
            },
            {
              term: "Technical information",
              text: "your IP address, browser and device type, and the pages and features you request, recorded in our hosting providers' server logs. When you sign up, or use the support chat without signing in, we also store your IP address in a rate-limiting table in our database to prevent abuse.",
            },
          ],
        },
      ],
    },
    {
      id: "cookies",
      heading: "Cookies and similar technologies",
      blocks: [
        {
          kind: "paragraph",
          text: "We use only essential cookies: they keep you signed in and protect forms against forgery. Your confirmation that you meet our age requirement is remembered in your browser's local storage.",
        },
        {
          kind: "paragraph",
          text: "We do not use advertising cookies or third-party analytics, and we do not track you across other companies' websites or apps.",
        },
      ],
    },
    {
      id: "how-we-use-information",
      heading: "How we use your information",
      blocks: [
        {
          kind: "list",
          items: [
            "To create and run your account and deliver the analysis and features you use.",
            "To process subscriptions and, for tipsters, to calculate earnings and payouts.",
            "To show public profiles, leaderboards, and performance statistics.",
            "To answer support requests, including through our AI support assistant.",
            "To keep the Service secure: preventing fraud, abuse, and automated sign-ups, and enforcing our [Terms of Service](/terms).",
            "To send you messages about your account, billing, or changes to our policies.",
            "To comply with legal obligations.",
          ],
        },
        {
          kind: "paragraph",
          text: "**We do not sell your personal information**, and we do not use it for targeted advertising.",
        },
      ],
    },
    {
      id: "ai-features",
      heading: "AI features",
      blocks: [
        {
          kind: "paragraph",
          text: "Two features use Claude, an AI model provided by Anthropic. They share different information:",
        },
        {
          kind: "definitions",
          items: [
            {
              term: "AI Picks",
              text: "when you generate an AI pick, we send Anthropic only the sport, bet type, and risk level you choose. Your name, email, and account details are not included.",
            },
            {
              term: "Support assistant",
              text: "so the assistant can answer questions about your own account, it receives your messages together with a summary of your account: your email address, username, account ID, and the date you joined; your Premium and AI Picks status; the tipsters you subscribe to, what you pay them, and when those subscriptions renew; and your pending and paid payout totals. If it hands your question to a person, the conversation and that summary are saved as a support ticket. If you prefer not to use the assistant, email us instead.",
            },
          ],
        },
      ],
    },
    {
      id: "service-providers",
      heading: "Service providers",
      blocks: [
        {
          kind: "paragraph",
          text: "We rely on the following companies to run the Service. Each receives only the information it needs for its role:",
        },
        {
          kind: "definitions",
          items: [
            {
              term: "Vercel",
              text: "hosts the website and application. See the [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy).",
            },
            {
              term: "Neon",
              text: "hosts our database, which stores the account, profile, pick, bet-tracking, support, and rate-limiting information described above. See the [Neon Privacy Policy](https://neon.com/privacy-policy).",
            },
            {
              term: "Anthropic",
              text: "provides the AI features described in [AI features](#ai-features). See the [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy).",
            },
            {
              term: "Payment processors",
              text: "process payments made on our website. They collect your card or payment details directly, under their own privacy policies; we receive only the purchase information described above.",
            },
            {
              term: "Apple, Google, and RevenueCat",
              text: "if you subscribe inside one of our mobile apps, Apple or Google handles billing under its own privacy policy, and RevenueCat manages the subscription record for us. See the [RevenueCat Privacy Policy](https://www.revenuecat.com/privacy).",
            },
            {
              term: "DiceBear",
              text: "generates default profile pictures. When your browser displays one, it requests the image from DiceBear, which receives your IP address and the username the picture belongs to.",
            },
          ],
        },
      ],
    },
    {
      id: "sharing",
      heading: "When we share information",
      blocks: [
        {
          kind: "list",
          items: [
            "**With service providers**, as described above, only as needed to run the Service.",
            "**Publicly, by design:** every account has a public profile. Anyone can see your name, username, profile picture, bio, specialties, join date, whether you are a Premium or verified member, your subscription price, your win-loss record, win rate, return on investment, subscriber count, total earnings, and any betslips you mark public. Tipster statistics also appear on the public leaderboard.",
            "**When required by law**, or when we believe in good faith it is needed to protect the rights, property, or safety of our users, the public, or us.",
            `**In a business transfer**, such as a merger or sale of assets, in which case the information stays subject to this policy.`,
          ],
        },
      ],
    },
    {
      id: "retention",
      heading: "How long we keep information",
      blocks: [
        {
          kind: "paragraph",
          text: `We keep your information while your account is open. When you ask us to delete your account, we delete or anonymize your personal information within ${DELETION_COMPLETION_DAYS} days, except records we must keep for legal, tax, accounting, or fraud-prevention reasons, such as transaction and payout records. Server logs held by our hosting providers are kept for limited periods under their own policies.`,
        },
      ],
    },
    {
      id: "your-rights",
      heading: "Your choices and rights",
      blocks: [
        {
          kind: "list",
          items: [
            `You can update your bio, specialties, and (for tipsters) subscription price in your account settings. For anything else, email ${SUPPORT_EMAIL_LINK}.`,
            `You can ask us for a copy of your personal information, ask us to correct it, or ask us to delete your account, by emailing ${SUPPORT_EMAIL_LINK} from the email address on your account.`,
            `We will confirm the request comes from you and respond within ${PRIVACY_REQUEST_RESPONSE_DAYS} days.`,
            "Depending on where you live, you may have additional privacy rights under local law. We honor the requests above wherever you live, and we will not treat you differently for making one.",
          ],
        },
      ],
    },
    {
      id: "security",
      heading: "Security",
      blocks: [
        {
          kind: "paragraph",
          text: "We protect your information with password hashing, encrypted HTTPS connections, restricted database access, and rate limits on account creation, the support chat, and AI Picks. No system is perfectly secure, so we cannot guarantee absolute security. If a breach affects your personal information, we will notify you as the law requires.",
        },
      ],
    },
    {
      id: "age-requirement",
      heading: "Age requirement",
      blocks: [
        {
          kind: "paragraph",
          text: `The Service is only for adults aged ${MINIMUM_AGE} or older, or older where the legal age for sports betting in your area is higher. We do not knowingly collect personal information from anyone younger. If you believe a minor has created an account, contact us and we will delete it.`,
        },
      ],
    },
    {
      id: "where-we-process",
      heading: "Where your information is processed",
      blocks: [
        {
          kind: "paragraph",
          text: "We and our service providers store and process information primarily in the United States. If you use the Service from outside the United States, your information will be transferred to and processed in the United States.",
        },
      ],
    },
    {
      id: "changes",
      heading: "Changes to this policy",
      blocks: [
        {
          kind: "paragraph",
          text: "When we update this policy, we will post the new version here and change the date at the top. If a change materially affects how we use your personal information, we will tell you by email or with a notice in the Service before it takes effect.",
        },
      ],
    },
    {
      id: "contact",
      heading: "Contact us",
      blocks: [
        {
          kind: "paragraph",
          text: `Questions or requests about your privacy: ${SUPPORT_EMAIL_LINK}. ${OPERATOR}.`,
        },
      ],
    },
  ],
}
