import { LegalDocumentView } from "@/components/legal/LegalDocumentView"
import { buildLegalMetadata } from "@/lib/legal/metadata"
import { privacyPolicy } from "@/lib/legal/privacy"

// Must stay public (see publicRoutes in middleware.ts): app stores and payment
// underwriters load this URL without an account.
export const metadata = buildLegalMetadata(privacyPolicy)

export default function PrivacyPage() {
  return <LegalDocumentView doc={privacyPolicy} />
}
