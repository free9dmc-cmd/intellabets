import type { Metadata } from "next"
import { BRAND, SITE_URL } from "./facts"
import type { LegalDocument } from "./types"
import { assertValidLegalDocument } from "./validate"

/**
 * Page <head> metadata for a legal document, built from the document itself
 * so the title and description can never disagree with the page body.
 *
 * It also validates the document. Pages call this at module level, so the
 * check runs during `next build`: a broken legal page fails the deploy.
 *
 * The canonical URL is absolute on purpose: the app sets no metadataBase, and
 * the same page is also reachable on *.vercel.app preview hosts. Canonical
 * tells search engines which address is the real one.
 */
export function buildLegalMetadata(doc: LegalDocument): Metadata {
  assertValidLegalDocument(doc)

  const title = `${doc.title} — ${BRAND}`
  const url = `${SITE_URL}${doc.path}`
  return {
    title,
    description: doc.summary,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: doc.summary,
      url,
      siteName: BRAND,
      type: "article",
      modifiedTime: doc.lastUpdated,
    },
  }
}
