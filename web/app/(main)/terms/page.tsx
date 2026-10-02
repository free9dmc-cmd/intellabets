import { LegalDocumentView } from "@/components/legal/LegalDocumentView"
import { buildLegalMetadata } from "@/lib/legal/metadata"
import { termsOfService } from "@/lib/legal/terms"

// Must stay public (see publicRoutes in middleware.ts): app stores and payment
// underwriters load this URL without an account.
export const metadata = buildLegalMetadata(termsOfService)

export default function TermsPage() {
  return <LegalDocumentView doc={termsOfService} />
}
