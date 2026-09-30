import Link from "next/link"
import { Fragment } from "react"
import { tokenizeRichText, type RichTextToken } from "@/lib/legal/rich-text"
import type { RichTextSource } from "@/lib/legal/types"

interface RichTextProps {
  text: RichTextSource
}

// The underline is the non-colour cue that marks a link (WCAG 1.4.1), so it
// must stay visible: /60 opacity keeps 3:1 contrast against the body text.
const LINK_CLASS =
  "font-medium text-purple-400 underline decoration-purple-400/60 underline-offset-4 transition-colors hover:text-purple-300 hover:decoration-purple-300"

/**
 * Renders a legal-document string (see lib/legal/rich-text.ts for the syntax).
 * A server component: it ships no JavaScript to the browser.
 */
export function RichText({ text }: RichTextProps) {
  return <>{tokenizeRichText(text).map(renderToken)}</>
}

function renderToken(token: RichTextToken, index: number) {
  switch (token.type) {
    case "text":
    // Build-time validation rejects documents containing a rejected link, so
    // this only ever renders during development; show the label, never the href.
    case "rejected-link":
      return <Fragment key={index}>{token.type === "text" ? token.value : token.label}</Fragment>

    case "bold":
      return (
        <strong key={index} className="font-semibold text-white">
          {token.value}
        </strong>
      )

    case "link":
      return renderLink(token, index)

    default: {
      // A new token type that is not handled here becomes a TypeScript error.
      const unhandled: never = token
      return unhandled
    }
  }
}

function renderLink(token: Extract<RichTextToken, { type: "link" }>, key: number) {
  switch (token.hrefKind) {
    // Other site pages: <Link> gives instant client-side navigation.
    case "internal":
      return (
        <Link key={key} href={token.href} className={LINK_CLASS}>
          {token.label}
        </Link>
      )

    // Other sites open in a new tab. rel="noopener noreferrer" stops the opened
    // page from controlling this tab through window.opener.
    case "external":
      return (
        <a key={key} href={token.href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
          {token.label}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )

    // Same-page anchors and email links are plain <a>: nothing to route.
    case "anchor":
    case "email":
      return (
        <a key={key} href={token.href} className={LINK_CLASS}>
          {token.label}
        </a>
      )
  }
}
