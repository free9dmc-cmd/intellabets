import { describe, expect, it } from "vitest"
import { escapeHtml, methodExplainerEmail, welcomeEmail, type EmailContent } from "./onboarding-emails"

const APP_URL = "https://intellabets.com"

const welcome = welcomeEmail({ appUrl: APP_URL, name: "Sam Rivera" })
const method = methodExplainerEmail({
  appUrl: APP_URL,
  unsubscribeUrl: "https://intellabets.com/unsubscribe?token=abc",
  postalAddress: "IntellaBets, 123 Example St, Phoenix, AZ 00000",
})
const ALL: Array<[string, EmailContent]> = [
  ["welcome", welcome],
  ["method explainer", method],
]

describe("escapeHtml", () => {
  it("neutralises markup in user-supplied text", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;"
    )
  })
})

describe("welcomeEmail", () => {
  it("greets by first name and escapes it in HTML", () => {
    expect(welcome.text.startsWith("Hi Sam,")).toBe(true)
    const hostile = welcomeEmail({ appUrl: APP_URL, name: "<img src=x onerror=alert(1)>" })
    expect(hostile.html).not.toContain("<img src=x")
    expect(hostile.html).toContain("&lt;img")
  })

  it("falls back to a neutral greeting with no usable name", () => {
    expect(welcomeEmail({ appUrl: APP_URL, name: "   " }).text.startsWith("Hi,")).toBe(true)
    expect(welcomeEmail({ appUrl: APP_URL }).text.startsWith("Hi,")).toBe(true)
  })

  it("builds absolute links from the app URL, tolerating a trailing slash", () => {
    const email = welcomeEmail({ appUrl: `${APP_URL}/` })
    expect(email.text).toContain("https://intellabets.com/how-it-works")
    expect(email.text).not.toContain("com//")
  })
})

describe("methodExplainerEmail", () => {
  it("carries the unsubscribe link and postal address in both parts", () => {
    for (const part of [method.text, method.html]) {
      expect(part).toContain("https://intellabets.com/unsubscribe?token=abc")
      expect(part).toContain("Phoenix, AZ")
    }
  })
})

describe.each(ALL)("%s copy rules (docs/LAUNCH-PLAN.md)", (_label, email) => {
  const body = `${email.subject}\n${email.text}\n${email.html}`

  it("includes 21+ and responsible-gambling wording in text and HTML", () => {
    for (const part of [email.text, email.html]) {
      expect(part).toContain("21+")
      expect(part).toContain("1-800-GAMBLER")
    }
  })

  it("makes no performance, earnings or guarantee claims", () => {
    // No settled performance figure exists for these emails to quote, so the
    // only percentage allowed is the 100% in "implied probabilities add up to
    // more than 100%" — method arithmetic, not a result. Anything else (a win
    // rate, a return) fails here.
    const percentages = [...body.matchAll(/\d+(\.\d+)?\s*%/g)].map((m) => m[0].replace(/\s/g, ""))
    expect(percentages.every((p) => p === "100%")).toBe(true)
    expect(body).not.toMatch(/\bROI\b|win rate|winning record|testimonial|subscribers|\bearn(ed|ings)?\b|\bprofitable\b/i)
    // "Guarantee" may appear only as a denial ("no outcome is guaranteed",
    // "no service can guarantee a profit"), never as a promise.
    for (const match of body.matchAll(/guarantee/gi)) {
      const before = body.slice(Math.max(0, (match.index ?? 0) - 25), match.index)
      expect(before).toMatch(/\bno\b|\bnot\b|\bcan't\b|\bcannot\b/i)
    }
  })

  it("says plainly that a bet can lose and IntellaBets takes no bets", () => {
    expect(email.text).toMatch(/not a sportsbook/)
    expect(email.text).toMatch(/can lose|more likely to win/)
  })
})
