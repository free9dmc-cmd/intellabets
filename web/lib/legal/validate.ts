import { formatLegalDate } from "./format"
import { LEGAL_PAGES } from "./pages"
import { tokenizeRichText } from "./rich-text"
import type { LegalBlock, LegalDocument, RichTextSource } from "./types"

/** Site routes legal documents may link to. Anything else is almost certainly a typo. */
const LINKABLE_ROUTES: ReadonlySet<string> = new Set([...LEGAL_PAGES.map((page) => page.href), "/how-it-works"])

const SECTION_ID = /^[a-z]+(?:-[a-z]+)*$/

/** Every piece of RichText in a block, in reading order. */
function blockTexts(block: LegalBlock): RichTextSource[] {
  switch (block.kind) {
    case "paragraph":
    case "callout":
      return [block.text]
    case "list":
      return [...block.items]
    case "definitions":
      return block.items.map((item) => item.text)
  }
}

/**
 * Throws if a legal document is malformed. Called while the page is built, so
 * a mistake fails the Vercel build instead of publishing a broken legal page:
 *   - the date is not a real YYYY-MM-DD date
 *   - a section id is duplicated or not kebab-case (ids are public anchors)
 *   - a link target is not allowed, or points at a missing section or page
 *   - markup was left unparsed (e.g. "**" inside a link label)
 */
export function assertValidLegalDocument(doc: LegalDocument): void {
  const problems: string[] = []
  const where = (detail: string) => `${doc.title}: ${detail}`

  try {
    formatLegalDate(doc.lastUpdated)
  } catch (error) {
    problems.push(where((error as Error).message))
  }

  const sectionIds = new Set<string>()
  for (const section of doc.sections) {
    if (!SECTION_ID.test(section.id)) problems.push(where(`section id "${section.id}" must be kebab-case`))
    if (sectionIds.has(section.id)) problems.push(where(`duplicate section id "${section.id}"`))
    sectionIds.add(section.id)
  }

  const blocks = [...(doc.preamble ?? []), ...doc.sections.flatMap((section) => section.blocks)]
  for (const text of blocks.flatMap(blockTexts)) {
    for (const token of tokenizeRichText(text)) {
      if (token.type === "rejected-link") {
        problems.push(where(`link target not allowed: ${token.href}`))
      } else if (token.type === "link" && token.hrefKind === "anchor" && !sectionIds.has(token.href.slice(1))) {
        problems.push(where(`link to missing section ${token.href}`))
      } else if (token.type === "link" && token.hrefKind === "internal" && !LINKABLE_ROUTES.has(token.href)) {
        problems.push(where(`link to unknown page ${token.href}`))
      } else if (
        // Bold is checked too: "**[a](/b)**" parses as bold text containing a
        // literal "[a](/b)", because links inside bold are not supported.
        (token.type === "text" || token.type === "bold") &&
        (token.value.includes("**") || token.value.includes("]("))
      ) {
        problems.push(where(`unparsed markup in: "${token.value}"`))
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid legal document\n  - ${problems.join("\n  - ")}`)
  }
}
