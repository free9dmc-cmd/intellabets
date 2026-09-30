/**
 * Registry of the public legal pages.
 *
 * Used by the legal footer (cross-links), the age gate (these pages must stay
 * readable without confirming age — app reviewers and parents need them), the
 * sitemap, and link validation. Add a page here and every consumer follows.
 */
export const LEGAL_PAGES = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/contact", label: "Support & Refunds" },
] as const

export type LegalPagePath = (typeof LEGAL_PAGES)[number]["href"]

export function isLegalPath(pathname: string | null | undefined): boolean {
  return LEGAL_PAGES.some((page) => page.href === pathname)
}
