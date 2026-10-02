/**
 * Tests for the legal documents and their parser. Run: npm run test:legal --workspace=@intellabets/web
 * Plain node:assert + tsx (already a dev dependency), so no test framework is needed.
 * Content rules (links, anchors, ids, dates) are ALSO enforced at build time by
 * validate.ts; these tests add the parser edge cases and negative cases.
 */
import assert from "node:assert/strict"
import { classifyHref, tokenizeRichText } from "@/lib/legal/rich-text"
import { formatLegalDate } from "@/lib/legal/format"
import { buildLegalMetadata } from "@/lib/legal/metadata"
import { assertValidLegalDocument } from "@/lib/legal/validate"
import { privacyPolicy } from "@/lib/legal/privacy"
import { termsOfService } from "@/lib/legal/terms"
import { supportAndRefunds } from "@/lib/legal/support"
import { PRICES, TIPSTER_SHARE_PERCENT, PLATFORM_FEE_PERCENT, SITE_HOST } from "@/lib/legal/facts"
import { isLegalPath } from "@/lib/legal/pages"
import type { LegalDocument, LegalBlock } from "@/lib/legal/types"

let passed = 0
const test = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name) }

console.log("tokenizer + href allowlist")
test("bold + link + text", () => assert.deepEqual(tokenizeRichText("a **b** [c](/terms) d"), [
  { type: "text", value: "a " }, { type: "bold", value: "b" }, { type: "text", value: " " },
  { type: "link", label: "c", href: "/terms", hrefKind: "internal" }, { type: "text", value: " d" }]))
test("javascript: becomes rejected-link, never link", () =>
  assert.deepEqual(tokenizeRichText("[x](javascript:alert)"), [{ type: "rejected-link", label: "x", href: "javascript:alert" }]))
for (const bad of ["//evil.com", "/\\evil.com", "/\\/evil.com", "http://a.com", "data:text/html,x", "#", "https:evil.com", "mailto:nobody", "/\tx"])
  test(`rejects ${JSON.stringify(bad)}`, () => assert.equal(classifyHref(bad), null))
test("accepts https / mailto / anchor / path", () => {
  assert.equal(classifyHref("https://vercel.com/legal/privacy-policy"), "external")
  assert.equal(classifyHref("https://www.ncpgambling.org"), "external")
  assert.equal(classifyHref("mailto:support@intellabets.com"), "email")
  assert.equal(classifyHref("#ai-features"), "anchor")
  assert.equal(classifyHref("/terms"), "internal")
})
test("HTML stays literal text", () => assert.deepEqual(tokenizeRichText("<script>x</script>"), [{ type: "text", value: "<script>x</script>" }]))
test("no quadratic blowup on 50k '['", () => { const t0 = Date.now(); tokenizeRichText("[".repeat(50000) + "x"); assert.ok(Date.now() - t0 < 200, `${Date.now() - t0}ms`) })

console.log("dates")
test("rejects malformed / impossible dates", () => { assert.throws(() => formatLegalDate("09/29/2026")); assert.throws(() => formatLegalDate("2026-02-30")) })
test("formats", () => assert.equal(formatLegalDate("2026-09-29"), "September 29, 2026"))

console.log("validator catches mistakes")
const base: LegalDocument = { title: "T", summary: "s", path: "/terms", lastUpdated: "2026-09-29", publisher: "P",
  sections: [{ id: "a", heading: "A", blocks: [{ kind: "paragraph", text: "ok" }] }] }
const withText = (text: string): LegalDocument => ({ ...base, sections: [{ ...base.sections[0], blocks: [{ kind: "paragraph", text }] }] })
test("valid doc passes", () => assertValidLegalDocument(base))
test("dangling anchor", () => assert.throws(() => assertValidLegalDocument(withText("[x](#nope)")), /missing section/))
test("unknown page", () => assert.throws(() => assertValidLegalDocument(withText("[x](/prvacy)")), /unknown page/))
test("rejected link", () => assert.throws(() => assertValidLegalDocument(withText("[x](http://a.com)")), /not allowed/))
test("unparsed markup", () => assert.throws(() => assertValidLegalDocument(withText("**[x](/terms)**")), /unparsed/))
test("duplicate id", () => assert.throws(() => assertValidLegalDocument({ ...base, sections: [base.sections[0], base.sections[0]] }), /duplicate/))
test("bad date", () => assert.throws(() => assertValidLegalDocument({ ...base, lastUpdated: "2026-13-01" })))

const docs = [privacyPolicy, termsOfService, supportAndRefunds]
const texts = (doc: LegalDocument): string[] => {
  const out: string[] = [doc.title, doc.summary]
  const f = (b: LegalBlock) => { if (b.kind === "paragraph" || b.kind === "callout") out.push(b.text); else if (b.kind === "list") out.push(...b.items); else out.push(...b.items.flatMap(i => [i.term, i.text])) }
  doc.preamble?.forEach(f); doc.sections.forEach(s => { out.push(s.heading); s.blocks.forEach(f) }); return out
}
for (const doc of docs) {
  console.log(`content: ${doc.title}`)
  const j = texts(doc).join("\n")
  test("passes build-time validation", () => assertValidLegalDocument(doc))
  test("metadata canonical", () => assert.equal((buildLegalMetadata(doc).alternates as { canonical: string }).canonical, `https://intellabets.com${doc.path}`))
  test("no stale/false claims", () => {
    for (const bad of [/Delaware/i, /arbitration/i, /Stripe/i, /crash data/i, /under 13/i, /all sales are final/i, /no personally identifiable/i, /in your account settings\. Cancel/i, /cancel at any time\*\* in your account settings/i, /preferred sportsbook/i, /other sensitive actions/i])
      assert.ok(!bad.test(j), `found ${bad}`)
  })
  test("no template leftovers", () => assert.ok(!/\$\{|undefined|NaN|\[object/.test(j)))
  test("publisher is the operator", () => assert.equal(doc.publisher, "Black Rose Studios, Inc., doing business as IntellaBets"))
}
console.log("facts")
test("prices from app constants", () => assert.deepEqual(PRICES, { premium: "$19.99", aiPicks: "$9.99", tipsterMin: "$4.99", tipsterMax: "$49.99" }))
test("split sums to 100", () => { assert.equal(TIPSTER_SHARE_PERCENT, 80); assert.equal(PLATFORM_FEE_PERCENT, 20) })
test("SITE_HOST derived", () => assert.equal(SITE_HOST, "intellabets.com"))
test("isLegalPath", () => { assert.ok(isLegalPath("/privacy")); assert.ok(isLegalPath("/contact")); assert.ok(!isLegalPath("/picks")); assert.ok(!isLegalPath(null)) })
test("terms & contact share identical refund text", () => {
  const r = texts(supportAndRefunds).filter(x => x.includes("within 30 days"))
  assert.ok(r.length === 1 && texts(termsOfService).includes(r[0]))
})
test("AI Picks limitation disclosed", () => assert.match(texts(termsOfService).join(" "), /does not receive live odds or schedules/))
console.log(`\n${passed} passed`)
