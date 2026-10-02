import type { RichTextSource } from "./types"

/**
 * Tokenizer for the tiny inline syntax used in legal documents:
 *   **bold**   and   [label](href)
 *
 * Why not a Markdown library or raw HTML? Two reasons:
 *   1. Security: we never hand a string to dangerouslySetInnerHTML, so there is
 *      no way for text — even text pasted from somewhere else — to inject
 *      markup or script into the page.
 *   2. Weight: two patterns do not justify a dependency.
 *
 * This file is pure logic (string in, tokens out) with no React, so it can be
 * tested and validated on its own. <RichText> turns the tokens into elements.
 */

export type HrefKind = "anchor" | "internal" | "external" | "email"

export type RichTextToken =
  | { readonly type: "text"; readonly value: string }
  | { readonly type: "bold"; readonly value: string }
  | { readonly type: "link"; readonly label: string; readonly href: string; readonly hrefKind: HrefKind }
  /** A [label](href) whose href is not allowed. Rendered as plain label text; rejected by validation. */
  | { readonly type: "rejected-link"; readonly label: string; readonly href: string }

// One capture group so String.split keeps the matched tokens in the output.
// Labels exclude both brackets: with "[" allowed, a long run of "[" made the
// engine retry from every position (quadratic time).
const INLINE_TOKEN = /(\*\*[^*]+\*\*|\[[^[\]]+\]\([^)\s]+\))/
const BOLD = /^\*\*([^*]+)\*\*$/
const LINK = /^\[([^[\]]+)\]\(([^)\s]+)\)$/

/**
 * Only these link targets are allowed; anything else (javascript:, data:,
 * plain http:, protocol-relative //host) is rejected.
 *
 * Backslashes and whitespace are refused outright: browsers treat "\" as "/",
 * so "/\evil.com" would silently become a link to another site.
 */
export function classifyHref(href: string): HrefKind | null {
  if (/[\\\s]/.test(href)) return null
  if (href.startsWith("#")) return href.length > 1 ? "anchor" : null
  if (href.startsWith("/") && !href.startsWith("//")) return "internal"
  if (/^https:\/\/[a-z0-9.-]+(?:[/?#]|$)/i.test(href)) return "external"
  if (/^mailto:[^@]+@[^@]+\.[^@]+$/i.test(href)) return "email"
  return null
}

export function tokenizeRichText(text: RichTextSource): RichTextToken[] {
  const tokens: RichTextToken[] = []

  for (const part of text.split(INLINE_TOKEN)) {
    if (part === "") continue

    const bold = BOLD.exec(part)
    if (bold) {
      tokens.push({ type: "bold", value: bold[1] })
      continue
    }

    const link = LINK.exec(part)
    if (link) {
      const [, label, href] = link
      const hrefKind = classifyHref(href)
      tokens.push(hrefKind ? { type: "link", label, href, hrefKind } : { type: "rejected-link", label, href })
      continue
    }

    tokens.push({ type: "text", value: part })
  }

  return tokens
}
