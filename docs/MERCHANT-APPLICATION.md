# Merchant account application prep

For SeamlessChex, PaymentCloud, Host Merchant Services or any high-risk
acquirer. The narrative sections are drafted; the factual sections are a
checklist, because nobody but the owner can supply them truthfully.

**Nothing in this file may be guessed at.** A merchant application is a
representation to a bank. An invented volume projection or a wrong EIN is
misrepresentation, and this business has already lost one processor over
claims it could not support.

---

## What only you can supply

| Field | Where to get it |
|---|---|
| Legal entity name, structure, state | Formation documents |
| EIN | IRS CP-575 letter, or a filed return |
| Business address | Must match the entity filing. A PO box is usually rejected |
| Owner name, SSN, DOB, home address, % ownership | Required for any owner at 25%+ |
| Bank account + routing (settlement) | A business account in the entity's name. A personal account is usually rejected |
| 3 months of bank statements | Even near-zero balances are fine; they want to see the account exists |
| Processing history | Prior statements if any, otherwise state plainly that there is none |
| **Projected monthly volume** | See below — this is the field people get wrong |
| **Average ticket** | $9.99-$19.99 based on the live pricing tiers |
| **Stripe's termination reason code** | Ask Stripe directly. See below |

### Projected volume

Give a number you can defend from the pricing page and a realistic customer
count, and say that it is a projection from a pre-revenue launch. Underwriters
compare declared volume against what actually arrives; overstating it to look
substantial reads as either dishonesty or incompetence, and a reserve is sized
off the number you give.

### The Stripe termination

They will find it. Volunteering it is strictly better than being caught.

The honest account: the site previously displayed aggregate statistics and
tipster performance figures that were placeholder content rather than measured
results. That content has been removed, the site now publishes no performance
figure that does not come from settled data, and the practice is enforced in
the codebase rather than left to judgement.

Get the reason code from Stripe before applying. "I don't know" is worse than
any actual reason, and whether a MATCH listing exists changes which acquirers
can even consider the file.

---

## Business description (drafted)

> IntellaBets is a subscription sports analytics service. We compare odds for
> the same event across major licensed sportsbooks, remove each book's margin
> to estimate a consensus probability, and show subscribers where the best
> available price differs from that consensus.
>
> We sell information. We do not accept wagers, hold customer funds, act as a
> bookmaker, or place bets on a customer's behalf. Customers place their own
> bets in their own accounts at their own sportsbooks. We are not a gambling
> operator and hold no gaming licence, because our product is analysis rather
> than betting.

## Products and pricing (drafted — confirm against the live site)

> Monthly subscriptions giving access to the analytics engine's output.
> Customers may also subscribe to individual independent analysts on the
> platform. All plans are month-to-month with no minimum term, cancellable at
> any time from account settings. Current pricing is published at
> intellabets.com/premium.

## How the service is delivered (drafted)

> Delivery is immediate and digital. On successful payment the subscriber's
> account is granted access within seconds and they can use the service at
> once. There is no physical product, no shipping, and no fulfilment delay.

Acquirers care about this because instant digital delivery removes the
"ordered and never received" chargeback category entirely.

## Refund policy (drafted — must match what the processor is told)

> Subscriptions are month-to-month and can be cancelled at any time, which
> stops all future billing. Because access is granted instantly and the
> content is consumed on delivery, we do not refund elapsed subscription
> periods. Billing errors, duplicate charges and unauthorised transactions are
> refunded in full. Published at intellabets.com/contact.

The stated policy, the site, and the processor's record must agree. A mismatch
is a compliance finding at the first dispute.

## Chargeback mitigation (drafted)

Underwriters weigh this heavily for subscriptions, which chargeback more than
one-off sales because customers forget they signed up.

> - A clear, recognisable descriptor on the card statement so charges are not
>   mistaken for fraud
> - Email receipt on every charge, and a renewal notice before each one
> - Self-service cancellation in account settings, with no need to contact
>   support
> - Staffed support at support@intellabets.com, answered from the same domain
> - Published terms and refund policy, reachable without an account
> - Age verification at signup; 21+ only
> - No claims of guaranteed outcomes or specific returns anywhere in marketing

## Compliance posture (drafted)

> - Not a gambling operator: no wagers accepted, no funds held, no betting
>   placed for customers
> - No performance claim is published that does not derive from settled,
>   recorded results
> - 21+ gate and responsible gambling resources on customer-facing pages
> - Terms, Privacy Policy and refund policy publicly reachable without an
>   account
> - Card data never touches our systems; payment pages are hosted by the
>   processor

---

## Before you submit

- [ ] Site loads, legal pages reachable signed-out
- [ ] Pricing on /premium matches the application
- [ ] Refund policy on /contact matches the application
- [ ] support@intellabets.com actually receives mail (needs the MX record)
- [ ] No performance figure on the site that settled data cannot support
- [ ] Stripe's termination reason code in hand
- [ ] Business bank account open in the entity's name

Apply to **one** acquirer at a time. Simultaneous applications show up in
underwriting and read as shopping for the laxest reviewer.

Expect 3-10 business days, 3-6% plus per-transaction fees, and a 5-10% rolling
reserve held 90-180 days. Budget for the reserve; it is the part that surprises
people, and it is withheld from settlement rather than invoiced.
