import { CANCELLATION_ITEMS, REFUND_ITEMS, TIPSTER_EARNINGS_ITEMS } from "./billing"
import {
  BRAND,
  HELPLINES,
  MINIMUM_AGE,
  OPERATOR,
  SUPPORT_EMAIL_LINK,
  SUPPORT_RESPONSE_BUSINESS_DAYS,
} from "./facts"
import type { LegalDocument } from "./types"

/**
 * Support & Refunds (served at /contact).
 *
 * Card networks require a merchant to publish reachable contact details and a
 * clear refund policy on a dedicated, linkable page — burying them in the
 * Terms is not enough for payment underwriters. The billing wording is shared
 * with the Terms via ./billing, so the two pages cannot disagree.
 */
export const supportAndRefunds: LegalDocument = {
  title: "Support & Refunds",
  path: "/contact",
  lastUpdated: "2026-09-29",
  publisher: OPERATOR,
  summary: `How to reach ${BRAND}, and how billing, cancellations, and refunds work.`,
  sections: [
    {
      id: "get-in-touch",
      heading: "Get in touch",
      blocks: [
        {
          kind: "definitions",
          items: [{ term: "Support and billing", text: SUPPORT_EMAIL_LINK }],
        },
        {
          kind: "paragraph",
          text: `We aim to reply to every message within ${SUPPORT_RESPONSE_BUSINESS_DAYS} business days. Please write from, or include, the email address on your account so we can find you quickly. Never send your password. We will never ask for it.`,
        },
      ],
    },
    {
      id: "cancelling",
      heading: "Billing and cancelling",
      blocks: [{ kind: "list", items: CANCELLATION_ITEMS }],
    },
    {
      id: "refunds",
      heading: "Refunds",
      blocks: [{ kind: "list", items: REFUND_ITEMS }],
    },
    {
      id: "tipster-earnings",
      heading: "Tipster earnings",
      blocks: [{ kind: "list", items: TIPSTER_EARNINGS_ITEMS }],
    },
    {
      id: "responsible-gambling",
      heading: "Responsible gambling",
      blocks: [
        {
          kind: "paragraph",
          text: `${BRAND} sells sports analysis for informational purposes. We are not a sportsbook, we do not accept wagers, and nothing we publish guarantees any outcome. You must be ${MINIMUM_AGE} or older to use the Service.`,
        },
        {
          kind: "paragraph",
          text: `If gambling is causing you harm, help is available: [ncpgambling.org](${HELPLINES.ncpg.url}) or call ${HELPLINES.ncpg.phone} (US, 24/7, confidential).`,
        },
      ],
    },
  ],
}
