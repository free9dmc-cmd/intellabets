import { LegalDocumentView } from "@/components/legal/LegalDocumentView"
import { buildLegalMetadata } from "@/lib/legal/metadata"
import { supportAndRefunds } from "@/lib/legal/support"

// Must stay public (see publicRoutes in middleware.ts): payment underwriters
// and card networks look for this page without an account.
export const metadata = buildLegalMetadata(supportAndRefunds)

export default function ContactPage() {
  return <LegalDocumentView doc={supportAndRefunds} />
}
