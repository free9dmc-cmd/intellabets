/**
 * The shape of a legal document (Privacy Policy, Terms of Service, ...).
 *
 * Legal pages are stored as DATA, not JSX. That split is deliberate:
 *   - the wording lives in lib/legal/*.ts, where a lawyer's edits touch nothing
 *     but text, and
 *   - the presentation lives in components/legal/*, where a design change
 *     cannot accidentally alter what the policy says.
 *
 * Everything here is `readonly` because a published policy is a record of what
 * we promised on a given date — nothing should mutate it at runtime.
 */

/**
 * Plain text with two tiny inline conventions, rendered by <RichText>:
 *   **bold**            -> <strong>
 *   [label](href)       -> a link. href may be a site path (/terms), an
 *                          in-page anchor (#retention), https://..., or mailto:
 * Anything else is rendered literally. No HTML is ever interpreted.
 */
export type RichTextSource = string

/** One labelled entry, e.g. "Account information: name, email, ..." */
export interface LegalDefinition {
  readonly term: string
  readonly text: RichTextSource
}

/** The building blocks a section is made of. `kind` tells the renderer which one it is. */
export type LegalBlock =
  | { readonly kind: "paragraph"; readonly text: RichTextSource }
  | { readonly kind: "list"; readonly items: readonly RichTextSource[] }
  | { readonly kind: "definitions"; readonly items: readonly LegalDefinition[] }
  | { readonly kind: "callout"; readonly text: RichTextSource }

export interface LegalSection {
  /**
   * Stable anchor for deep links (e.g. /privacy#your-rights). Other pages,
   * emails, and app-store listings may link to these, so never rename one
   * after it has been published.
   */
  readonly id: string
  readonly heading: string
  readonly blocks: readonly LegalBlock[]
}

export interface LegalDocument {
  readonly title: string
  /** One-sentence summary, used under the title and as the meta description. */
  readonly summary: string
  /** Site path where the document is served, e.g. "/privacy". */
  readonly path: string
  /** Calendar date of the current version, ISO format "YYYY-MM-DD". */
  readonly lastUpdated: string
  /** Who publishes the document, shown under the title (the legal operator). */
  readonly publisher: string
  /** Optional notice shown before the numbered sections. */
  readonly preamble?: readonly LegalBlock[]
  readonly sections: readonly LegalSection[]
}
