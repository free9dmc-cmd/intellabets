# Onboarding email copy

Draft text for the transactional/lifecycle sequence. **Nothing sends these yet**:
no email provider is configured (LAUNCH-PLAN P1), so this is copy waiting for a
sender. Written now so that wiring one up is an afternoon, not a copywriting
project.

## Rules these emails follow

- No win rates, ROI, records, testimonials, subscriber counts, earnings or
  income projections. If a number is not in the product today, it is not in the
  email.
- No guaranteed outcomes. Positive expected value describes the *price* of a
  bet relative to the market's consensus, not whether any single bet wins.
- Every email carries the footer below. Marketing emails (2–5) also need a
  working unsubscribe link and the postal address required by CAN-SPAM; email 1
  is transactional and does not.
- Never mention premium pricing in copy until the tiers on `/premium` match what
  a live processor will charge (LAUNCH-PLAN "Pricing").
- Minimum age is **21+** (commit 95e5340). Use that, not 18+.
- Links use `{{APP_URL}}`; merge fields are `{{first_name}}` (fall back to
  "there") and `{{unsubscribe_url}}`.

### Standard footer (all emails)

> IntellaBets is for entertainment and information. 21+ only. We do not accept
> bets and are not a sportsbook. Past results do not predict future ones, and no
> bet is certain to win. If gambling is a problem for you or someone you know,
> call 1-800-522-4700 (US, 24/7, confidential) or visit
> {{APP_URL}}/responsible-gambling.
>
> {{postal_address}} · {{unsubscribe_url}}

---

## 1. Welcome (transactional, send on registration)

**Trigger:** account created. **Subject:** Your IntellaBets account is ready
**Preview:** Where to start, in about two minutes.

Hi {{first_name}},

Your account is set up. Here is what IntellaBets is, so you know what to expect.

We compare odds across the major sportsbooks, remove each book's built-in margin
(the "vig"), and show you where the best available price is better than the
market's own consensus. That gap is the whole product. It tells you about
*price*, not about whether a given bet wins. Plenty of well-priced bets lose.

Where to start:

- **How it works** — the method, with a worked example:
  {{APP_URL}}/how-it-works
- **Closing line value** — how to judge a bet by price, not by result:
  {{APP_URL}}/closing-line-value
- **Responsible gambling** — limits and help lines, worth reading before your
  first bet: {{APP_URL}}/responsible-gambling

We don't publish a win rate. There isn't a long enough settled record to quote
one honestly, and we'd rather say that than make one up.

— The IntellaBets team

*[standard footer]*

---

## 2. The method in one email (day 2)

**Subject:** How we find a price worth taking
**Preview:** Two minutes on removing the vig.

Hi {{first_name}},

A sportsbook's odds include its margin. If you add up the implied probabilities
of every outcome, you get more than 100%. The excess is the book's cut.

"De-vigging" strips that excess out, so what's left is a fair estimate of what
the market thinks each outcome's chance is. Compare that estimate with the best
price any single book is offering, and where the price pays more than the
probability warrants, that's a bet with positive expected value *at that price*.

Two honest caveats:

1. The consensus is an estimate, not the truth. It can be wrong.
2. Positive expected value only shows up over many bets. Any single bet can lose.

The full walkthrough with a worked example (clearly labelled illustrative, not
a real game) is here: {{APP_URL}}/how-it-works

*[standard footer + unsubscribe]*

---

## 3. Judge by price, not by result (day 5)

**Subject:** Why one winning night proves very little
**Preview:** What closing line value is, and what it isn't.

Hi {{first_name}},

Short samples are mostly noise. A bettor can find good prices and lose for a
month, or find bad ones and win for a month.

Closing line value (CLV) asks a different question: did the price you took beat
the price at the close, when the market is at its best-informed? It's a more
stable signal than results over a small number of bets. It is still not a
guarantee, and it says nothing about any one wager.

We have not published a CLV average. Our settlement logic was corrected recently
and we want a clean sample before we quote a figure. When there's enough data,
we'll say so on the site.

Read more: {{APP_URL}}/closing-line-value

*[standard footer + unsubscribe]*

---

## 4. Set your limits (day 9)

**Subject:** Before you bet: set a limit
**Preview:** A two-minute habit that matters more than any pick.

Hi {{first_name}},

Whatever tools you use, the thing that most protects you is a limit you set
*before* you're in the moment: a monthly amount you can afford to lose entirely,
and a rule for walking away.

- Decide the amount first, and keep it separate from money you need.
- Never chase losses.
- Most sportsbooks have deposit limits and cool-off tools in their account
  settings. Use them.
- Take a break if betting stops being fun.

If it already has, call 1-800-522-4700 (US, 24/7, confidential) or see
{{APP_URL}}/responsible-gambling.

*[standard footer + unsubscribe]*

---

## 5. Check-in (day 14, only if the user has not returned since day 3)

**Subject:** Anything we can explain better?
**Preview:** Reply and tell us what wasn't clear.

Hi {{first_name}},

You signed up a couple of weeks ago and we haven't seen you since. If something
was confusing or missing, reply to this email. A person reads the replies.

If it just wasn't for you, no hard feelings, and the unsubscribe link below
stops these for good.

*[standard footer + unsubscribe]*

---

## Before wiring up sending

- [ ] Pick a provider and verify the sending domain (SPF, DKIM, DMARC).
- [ ] Add a stored unsubscribe/suppression flag; honour it before every send.
- [ ] Add the postal address to the footer.
- [ ] Have counsel confirm the footer wording against the jurisdictions served.
- [ ] Gate emails 2–5 on marketing consent; email 1 is account-related only.
