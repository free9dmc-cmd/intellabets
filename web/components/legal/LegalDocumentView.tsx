import Link from "next/link"
import { formatLegalDate } from "@/lib/legal/format"
import { LEGAL_PAGES } from "@/lib/legal/pages"
import type { LegalBlock, LegalDocument } from "@/lib/legal/types"
import { RichText } from "./RichText"

interface LegalDocumentViewProps {
  doc: LegalDocument
}

interface LegalBlockViewProps {
  block: LegalBlock
}

/** 0 -> "01". Two digits keep the table of contents aligned. */
function sectionNumber(index: number): string {
  return String(index + 1).padStart(2, "0")
}

/**
 * Renders any LegalDocument: header, optional notice, table of contents, and
 * numbered sections. It holds no legal wording of its own — change the words
 * in lib/legal, change the look here.
 *
 * Section numbers are generated from order, so inserting a section can never
 * leave the numbering wrong. Anchors use each section's stable `id`.
 *
 * Server component: no hooks, no client JavaScript. Pages using it are
 * rendered to static HTML at build time.
 *
 * Text colours are chosen to pass WCAG AA (4.5:1) on the #080b14 background;
 * the body column is capped near 75 characters per line for readability.
 */
export function LegalDocumentView({ doc }: LegalDocumentViewProps) {
  const otherPages = LEGAL_PAGES.filter((page) => page.href !== doc.path)

  return (
    <article className="mx-auto max-w-2xl py-10">
      <header className="border-b border-[#1e2a3a] pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-400">Legal</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">{doc.title}</h1>
        <p className="mt-4 text-base leading-7 text-gray-300">{doc.summary}</p>
        {/* Stacks on phones; one line with a separator dot from the sm breakpoint up. */}
        <p className="mt-5 flex flex-col gap-1 text-sm text-gray-400 sm:flex-row sm:items-center sm:gap-2">
          <span>
            Last updated <time dateTime={doc.lastUpdated}>{formatLegalDate(doc.lastUpdated)}</time>
          </span>
          <span aria-hidden="true" className="hidden text-gray-600 sm:inline">
            ·
          </span>
          <span>{doc.publisher}</span>
        </p>
      </header>

      {doc.preamble && (
        <div className="mt-8 space-y-4">
          {doc.preamble.map((block, index) => (
            <LegalBlockView key={index} block={block} />
          ))}
        </div>
      )}

      <nav aria-labelledby="legal-toc-heading" className="card mt-8 p-5 sm:p-6">
        <h2 id="legal-toc-heading" className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
          On this page
        </h2>
        {/* CSS columns fill top-to-bottom (01-10 left, 11-19 right), which is
            how people read a numbered list; a 2-column grid would zig-zag. */}
        <ol className="mt-4 text-sm sm:columns-2 sm:gap-x-8">
          {doc.sections.map((section, index) => (
            <li key={section.id} className="mb-2.5 break-inside-avoid last:mb-0">
              <a
                href={`#${section.id}`}
                className="group flex gap-3 text-gray-200 transition-colors hover:text-white"
              >
                <span className="tabular-nums text-gray-400 transition-colors group-hover:text-purple-400">
                  {sectionNumber(index)}
                </span>{" "}
                {section.heading}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-12 space-y-12">
        {doc.sections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-heading`}
            className="scroll-mt-24"
          >
            <h2 id={`${section.id}-heading`} className="flex items-baseline gap-3 text-xl font-bold text-white">
              <span className="text-sm font-black tabular-nums text-purple-400">{sectionNumber(index)}</span>{" "}
              {section.heading}
            </h2>
            <div className="mt-4 space-y-4 text-base leading-7 text-gray-300">
              {section.blocks.map((block, blockIndex) => (
                <LegalBlockView key={blockIndex} block={block} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-16 border-t border-[#1e2a3a] pt-8">
        <nav aria-label="Other legal pages" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {otherPages.map((page) => (
            <Link key={page.href} href={page.href} className="text-gray-400 transition-colors hover:text-white">
              {page.label}
            </Link>
          ))}
        </nav>
      </footer>
    </article>
  )
}

/** Renders one content block. The `switch` covers every LegalBlock kind. */
function LegalBlockView({ block }: LegalBlockViewProps) {
  switch (block.kind) {
    case "paragraph":
      return (
        <p>
          <RichText text={block.text} />
        </p>
      )

    case "list":
      return (
        <ul className="list-disc space-y-2 pl-5 marker:text-purple-400/70">
          {block.items.map((item, index) => (
            <li key={index} className="pl-1">
              <RichText text={item} />
            </li>
          ))}
        </ul>
      )

    case "definitions":
      return (
        <dl className="space-y-3">
          {block.items.map((item) => (
            <div key={item.term} className="border-l-2 border-purple-400/40 pl-4">
              <dt className="inline font-semibold text-white">{item.term}: </dt>
              <dd className="inline">
                <RichText text={item.text} />
              </dd>
            </div>
          ))}
        </dl>
      )

    case "callout":
      return (
        <div
          role="note"
          className="rounded-xl border border-amber-500/25 bg-amber-500/[0.08] p-5 text-sm leading-6 text-amber-100/90"
        >
          <RichText text={block.text} />
        </div>
      )

    default: {
      // If a new block kind is added to LegalBlock but not handled above,
      // this line stops the build (TypeScript error) instead of silently
      // dropping content from a legal page.
      const unhandled: never = block
      return unhandled
    }
  }
}
