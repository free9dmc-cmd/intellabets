# Sportsbook partnership contacts

Last checked: 2026-10-22. Each email address and form link below was checked that day: we fetched its source page and searched it for the exact address or link. The machine-readable copy is [`contacts.csv`](./contacts.csv), with columns `tier,rank,book,parent,channel,contact,source_url,confidence`.

IntellaBets is a pre-launch analytics product with no users and no revenue. Every application, form and email must say so plainly. The intro email is [`intro-email.txt`](./intro-email.txt) and the deck is [`IntellaBets-Sportsbook-Partnership.pptx`](./IntellaBets-Sportsbook-Partnership.pptx).

**Confidence values**
- `verified`: the address or link was found on the official source page on 2026-10-22, and that page labels it for this purpose.
- `likely`: the address was found on the official page on 2026-10-22, but the page does not label it for partnerships. For example, it is a form's routing address or an office inbox. It may not reach the right team.
- `unconfirmed`: the source page could not be loaded on 2026-10-22, so the address has not been re-checked. Confirm it on the live site before you send anything.

Only published business channels are listed: affiliate programs, partnerships or B2B contacts, press contacts and official forms. Three press contacts are named people. Each is listed because the company itself names them as its media contact in an official release, and the source is linked. Customer-support, investor-relations and personal sales addresses are left out.

---

## How to approach

1. **Apply through the affiliate program first.** This is the channel that actually answers. Affiliate teams own deep-link and tracking specs, and the operator usually sponsors or confirms your state vendor filing. The books with a working application route are DraftKings (Google Form), BetMGM and Borgata (BetMGM Partners), bet365 (bet365 Partners), BetRivers (Rush Affiliates), betPARX (on-site form) and Betr (Google Form). Caesars runs a program on Income Access, but its site could not be loaded. Answer every audience and traffic question honestly: there is no audience yet.
2. **Use partnerships or B2B contacts only for API, deep-link or integration questions** that the affiliate team cannot handle, such as an official betslip deep-link spec or data access. These are DraftKings `sportspartnerships@`, the theScore / Score Media contact form, the RSI contact form, the Desert Diamond vendor form, Bally's general contact, and, outside the US ranking, Super Group `corp.dev@` and Sporttrade `info@`. Send one short email that links to the deck. Do not send the same pitch to several addresses at one company.
3. **Use press contacts only for press.** That means a launch announcement or a media question, never a partnership pitch. Pitching a press desk is the fastest way to be ignored.
4. **Where nothing is published** (FanDuel affiliates, Hard Rock Bet, Novig), wait for an introduction, or approach the company through its official LinkedIn page. Do not guess address patterns.

### Compliance first steps (do these before the first application)

This summarizes the compliance research. It is research, not legal advice: a gaming lawyer should confirm the CPA structure, especially for IL and NY. Fee figures are as published on the regulators' pages and must be re-confirmed before filing.

1. **Fix the site before any operator reviews it.** Operators audit affiliate sites.
   - Change every "18+" to "21+". On 2026-10-22, "18+" still appeared in `web/components/Footer.tsx`, `web/app/page.tsx`, `web/app/(main)/picks/page.tsx`, `web/app/(auth)/register/page.tsx`, `web/app/layout.tsx`, `web/lib/support-agent.ts`, `backend/src/modules/predictions/placement.ts`, `skills/pick-writeup/SKILL.md` and `skills/intellabets.agent.yaml`.
   - Add a responsible-gaming message and helpline to every page that shows a betslip link. Use 1-800-GAMBLER for NJ.
   - Ban the words "risk-free", "free bet", "guaranteed win" and "lock".
   - Add a clear affiliate-relationship disclosure (NY 9 NYCRR 5329.37(b)(4)).
2. **Gate betslip links by the user's state.** Show "Open betslip ->" only for books licensed in the user's state, and show none in states without legal online sports betting. The Odds API `us` region also returns BetOnline.ag, BetUS, Bovada, LowVig.ag and MyBookie.ag. **Done in code (2026-10-22):** these offshore books, and any unregistered book, can no longer be offered as the place to bet or shown in the comparison panel; prediction exchanges and sweepstakes apps are off by default too. Per-state gating of licensed books is still to do. The rules this protects are MI R 432.729, OH 3775-16-08(I), MA 205 CMR 256.02(2) and NY's non-licensee disclaimer rule.
3. **Accept CPA or flat-fee pay only at launch.** That keeps IntellaBets in the lowest licensing tier in every state: NJ vendor registration, PA gaming service provider registration, MI vendor, CO Vendor Minor and MA registrant. It is also the only model allowed in NY (PML 1341(1)) and MA (205 CMR 256.01(3)). For IL, get counsel to confirm the CPA trigger does not depend on wager volume or outcome (11 Ill. Adm. Code 1900.340(f)).
4. **Prepare one licensing pack and reuse it.** Include:
   - formation documents and a certificate of good standing;
   - an ownership chart listing every 10%+ owner, officer and director;
   - personal-history information for each of those people, ready for fingerprinting;
   - tax returns (PA certification asks for 3 years);
   - a product description stating that it takes no wagers;
   - an honest statement that IntellaBets is pre-launch with no users or revenue.
5. **Join the affiliate programs. The operator then sponsors or confirms the state filing.** In NJ the casino licensee files the Vendor Registration Form. MA requires a "Confirmation of Business Relationship from the Operator". In PA the licensee submits the gaming service provider application. Ask each affiliate team for its state onboarding checklist.
6. **File the low-tier registrations.**
   - NJ vendor registration: no fee. Then file the Supplemental Disclosure Form with DGE within 30 days.
   - MI vendor registration: $200.
   - PA gaming service provider registration: $500 + $60 per qualifier + $2,500 per 5 years.
   - VA vendor registration: $500 for 3 years.
   - CO Vendor Minor: $350.
   - MA Sports Wagering Registrant: $5,000. Send the Scoping Survey to `mgcvendorlicensing@massgaming.gov` first.
   - AZ marketing affiliate licence: fee unverified.
   - IL and OH: no affiliate licence, but their ad rules apply.
   - NY and NC: ask the regulators directly whether affiliates must register.
7. **Go live state by state,** only where both the registration and the operator's approval are in place. Archive every ad: NJ N.J.A.C. 13:69O-1.8(g); NY requires 4 years of records. Honour self-exclusion.
8. **Consider revenue share only after real traffic exists,** and only where it is allowed. Never use it in IL, MA or NY.
9. **Keep up with renewals:** MI every 5 years, VA every 3, PA every 5. An NJ vendor registration lapses after 3 years without business. Expect each operator to certify its affiliates to NJ DGE every year by Dec 31.

---

## Contacts by book (traffic order)

Books are listed in the project's traffic ranking order: tier 1 first, then tier 2. The ranking came from the coordinator's traffic research, and no traffic figures are reproduced here.

### Tier 1

#### 1. FanDuel Sportsbook
- **Parent:** FanDuel (Flutter Entertainment). fanduel.com/about links Investor Relations to flutter.com.
- **Affiliate program:** Not verified. `partners.fanduel.com` exists but did not load: it returned HTTP 503 in research and failed the TLS handshake on 2026-10-22. `affiliates.fanduel.com` and `fanduelpartners.com` do not resolve, and `fanduel.com/affiliates` returns 404.
- **Platform:** Not verified. One third-party review says Income Access, but no official source confirms it.

| Channel | Contact | Source | Confidence |
|---|---|---|---|
| press | press@fanduel.com | https://www.fanduel.com/about | verified |

Notes: No official partnerships or B2B address was found. Third-party directories point to `fanduel.com/partners` as the affiliate sign-up. On fanduel.com that page is "Our Partners", about league, team and media deals, with no sign-up form and no contact address.

#### 2. DraftKings Sportsbook
- **Parent:** DraftKings Inc.
- **Affiliate program:** https://www.draftkings.com/affiliates
- **Platform:** Not stated. Applications go through a Google Form titled "DraftKings Affiliates Interest Survey".

| Channel | Contact | Source | Confidence |
|---|---|---|---|
| affiliate (form) | https://forms.gle/rW2KTw2PgaJuFop36 | https://www.draftkings.com/affiliates | verified |
| partnerships/b2b | sportspartnerships@draftkings.com | https://www.draftkings.com/about | verified |
| press | media@draftkings.com | https://www.draftkings.com/about | verified |

Notes:
- The form link resolves to `docs.google.com/forms/d/e/1FAIpQLSfUZyolQz_G0iriFrvfKBPhs1p5vJBnqKm619PPuUNMVS8S0Q/viewform`.
- The form asks which products you promote (DFS, Sportsbook, Casino), your state registration and licence numbers, your audience size by state, and which other operators you promote. Answer honestly: pre-launch, no audience yet.
- `draftkings.com/about` redirects to `/draftkings-about`. There, "Partner with Us" links to `sportspartnerships@` and "Press Contact" links to `media@`.

#### 3. Fanatics Sportsbook
- **Parent:** Fanatics Betting & Gaming (Fanatics Inc.)
- **Affiliate program:** Not found. `fanaticsaffiliates.com` and the Impact network program are for Fanatics merchandise, not the sportsbook.
- **Platform:** Not found.

| Channel | Contact | Source | Confidence |
|---|---|---|---|
| general-business (form) | https://www.fanaticsinc.com/contact-us/ | https://www.fanaticsinc.com/contact-us/ | verified |

Notes: The corporate form asks you to "Select an option below to choose the appropriate department". The department list loads by script and could not be read. The betfanatics.com footer has only a Support link. No media address for Fanatics Betting & Gaming was found.

#### 4. Hard Rock Bet
- **Parent:** Seminole Hard Rock Digital, LLC (Hard Rock Digital)
- **Affiliate program:** Not found. `hardrock.bet/affiliates` returns 404.
- **Platform:** Not found.

No verified affiliate, partnership or press contact. The hardrock.bet footer and About page publish no business emails, and hardrock.bet returned 403 on 2026-10-22. hardrockdigital.com has only careers and LinkedIn links. The "Hospitality Partners" form is for Florida bars and venues, so it does not fit. The realistic route is Hard Rock Digital on LinkedIn (linkedin.com/company/hardrockdigital) or an introduction.

#### 5. BetMGM
- **Parent:** BetMGM, LLC (per the betmgmpartners.com footer)
- **Affiliate program:** https://www.betmgmpartners.com/ (linked from the betmgminc.com homepage)
- **Platform:** BetMGM Partners runs its own portal. Its page paths start with `gvc`, which suggests Entain's in-house platform. That is an inference only.

| Channel | Contact | Source | Confidence |
|---|---|---|---|
| affiliate | partners@betmgm.com | https://www.betmgmpartners.com/gvcHelp.do | verified |
| affiliate (form) | https://www.betmgmpartners.com/gvcContactUs.do | https://www.betmgmpartners.com/gvcContactUs.do | verified |
| press | press@betmgm.com | https://www.betmgminc.com/who-we-are/press-room/ | verified |

Notes:
- The FAQ says to "share any licensing information at partners@betmgm.com while applying to various states".
- The program also covers Borgata, PartyCasino and partypoker.
- The contact page offers an email form and phone lines (08:00-17:00 GMT).

#### 6. Caesars Sportsbook
- **Parent:** Caesars Entertainment, Inc.
- **Affiliate program:** http://www.caesarsaffiliates.com/ (`caesars.com/affiliate/faq` calls it "our i-gaming affiliate program")
- **Platform:** Income Access, per the official Caesars FAQ, re-checked on 2026-10-22.

| Channel | Contact | Source | Confidence |
|---|---|---|---|
| affiliate | affiliates@CaesarsInteractive.com | http://www.caesarsaffiliates.com/help/ | unconfirmed |
| press | PressLV@Caesars.com | https://newsroom.caesars.com/ | verified |
| press | kwhiteley@caesars.com | [Caesars Q4 2025 results-date release (PDF)](https://s202.q4cdn.com/508919455/files/doc_news/Caesars-Entertainment-Inc--to-Report-2025-Fourth-Quarter-and-Full-Year-Results-on-February-17-2026-2026.pdf) | verified |

Notes:
- `caesarsaffiliates.com` is behind Incapsula bot protection and returned 503 on 2026-10-22, as it did during research. The affiliate address came only from a search-engine excerpt of that page, so confirm it on the live site before you use it.
- `kwhiteley@caesars.com` belongs to Kate Whiteley, listed as "Media Relations" in the official release.
- `PressLV@` (phone 702-880-6988) is the newsroom media contact and may focus on Las Vegas properties.
- No sportsbook-specific B2B contact was found.

#### 7. bet365 (US)
- **Parent:** bet365 Group. The partner program is run by Hillside (Sports) GP Limited, Gibraltar, per the bet365partners.com footer.
- **Affiliate program:** https://www.bet365partners.com/
- **Platform:** bet365's own "bet365 Partners" portal. No third-party network.

| Channel | Contact | Source | Confidence |
|---|---|---|---|
| affiliate (form) | https://www.bet365partners.com/en/contactus | https://www.bet365partners.com/en/contactus | verified |

Notes:
- Use the "Marketing Opportunity" subject option.
- Account managers work Mon-Fri, 08:30-17:00 UK time. Postal address: bet365 House, Media Way, Stoke-on-Trent ST1 5SZ, UK.
- The partner site does not mention US eligibility, so ask whether US traffic is accepted.
- No official press contact was found.

### Tier 2

#### 8. BetRivers
- **Parent:** Rush Street Interactive, Inc.
- **Affiliate program:** https://rush-affiliates.com/ (linked as "Rush Affiliates" from the BetRivers footer). The login portal is https://partners.rush-affiliates.com/.
- **Platform:** Not identified.

| Channel | Contact | Source | Confidence |
|---|---|---|---|
| affiliate | affiliates@rush-affiliates.com | https://rush-affiliates.com/ | verified |
| general-business (form) | https://www.rushstreetinteractive.com/contact | https://www.rushstreetinteractive.com/contact | verified |
| general-business | chicago@rushstreetinteractive.com | https://www.rushstreetinteractive.com/contact | likely |
| press | lisa@lisajohnsoncommunications.com | [RSI Q2 2026 results release](https://ir.rushstreetinteractive.com/news/news-details/2026/Rush-Street-Interactive-Announces-Second-Quarter-2026-Results-and-Raises-Full-Year-Guidance/default.aspx) | verified |

Notes:
- `rush-affiliates.com` renders with JavaScript. The address is in its main bundle as the mailto link in the "Get in touch" section.
- `chicago@` is the "USA - Chicago" office address in the RSI contact page data. It is not labelled for partnerships.
- Lisa Johnson runs an outside PR firm and is listed under "Media Contacts" in RSI's release.
- `betriversaffiliates.com` is a parked domain and not official.

#### 9. theScore Bet (PENN; formerly ESPN Bet)
- **Parent:** PENN Entertainment, Inc. (Score Media and Gaming Inc.)
- **Affiliate program:** Not found.
- **Platform:** Not found.

| Channel | Contact | Source | Confidence |
|---|---|---|---|
| general-business (form) | https://www.scoremediaandgaming.com/contact | https://www.scoremediaandgaming.com/contact | verified |
| general-business | hello@thescore.com | https://www.scoremediaandgaming.com/contact | likely |
| press | jeff.morris@pennentertainment.com | [AOL copy of PENN's Business Wire release](https://www.aol.com/articles/penn-entertainment-launches-thescore-bet-113000000.html) | verified |

Notes:
- ESPN Bet customers were moved to theScore Bet on Dec 1, 2025.
- `hello@thescore.com` is where the contact form sends "General Inquiries". It appears in the site's JavaScript, not as visible text.
- Jeff Morris is VP Public Affairs at PENN (610/373-2400). He is listed under "Media" in PENN's July 13, 2026 Business Wire release (businesswire.com/news/home/20260713662385/en). Business Wire returned 403, so the address was confirmed on AOL's verbatim copy.
- `pennentertainment.com` and `thescore.bet` blocked fetches, so no affiliate or B2B page could be checked.

#### 10. Kalshi
Not researched in this pass, so no contacts are listed.

#### 11. Polymarket US
Not researched in this pass, so no contacts are listed.

#### 12. Underdog (Underdog Fantasy)
Not researched in this pass, so no contacts are listed.

#### 13. PrizePicks
Not researched in this pass, so no contacts are listed.

#### 14. DraftKings Pick6
Use the DraftKings channels under #2. The DraftKings affiliate form lists DFS among the products you can promote. No separate Pick6 contact was researched.

#### 15. Bally Bet
- **Parent:** Bally's Corporation
- **Affiliate program:** Not found.
- **Platform:** Not found.

| Channel | Contact | Source | Confidence |
|---|---|---|---|
| press | mediarelations@ballys.com | https://www.ballys.com/ | verified |
| general-business | info@ballys.com | https://www.ballys.com/ | verified |
| general-business (form) | https://www.ballys.com/contact/default.aspx | https://www.ballys.com/ | verified |

Notes:
- `info@` sits under "Connect with us" with no other label.
- The Suppliers page (https://www.ballys.com/suppliers/default.aspx) may suit a vendor or B2B approach.
- The ballybet.com footer has only customer-support addresses, which are left out.

#### 16. betPARX
- **Parent:** Parx (betPARX brand; the operating entity was not verified)
- **Affiliate program:** https://www.betparx.com/ ("Work With Us" > "Sign Up" > "Join the betPARX Affiliate Program")
- **Platform:** betPARX's own web form. Commission is tracked by registration code. No network is named.

| Channel | Contact | Source | Confidence |
|---|---|---|---|
| affiliate (form) | https://www.betparx.com/ (form `affiliate-form`) | https://www.betparx.com/ | verified |

Notes: The form asks for states licensed, products promoted, monthly traffic, audience demographics, marketing channels and responsible-gaming practices. No published email address or press contact was found.

#### 17. Circa Sports
- **Parent:** Circa Sports (Circa Resort & Casino, Las Vegas)
- **Affiliate program:** Not found. `/contact` and `/affiliates` return 404.
- **Platform:** Not found.

| Channel | Contact | Source | Confidence |
|---|---|---|---|
| general-business | info@circasports.com | https://www.circasports.com/support | likely |

Notes: This is the only non-personal address found. The support page gives it for contest-offer requests to Operations. It is a general route, not a partnerships desk. Circa's homepage lists NV, CO, IL, IA, KY and MO.

#### 18. Bet Desert Diamond
- **Parent:** Desert Diamond Casinos & Entertainment (Tohono O'odham Gaming Enterprise)
- **Affiliate program:** Not found.
- **Platform:** Not found.

| Channel | Contact | Source | Confidence |
|---|---|---|---|
| partnerships/b2b (form) | https://www.ddcaz.com/vendor-form | https://www.ddcaz.com/vendor-form | verified |

Notes: The vendor form asks whether you are "Certified by the Arizona Department of Gaming", so vendor licensing may be required first. The press room has no media contact, and the betting app publishes no business contacts.

#### 19. Betly (Delaware North)
Not researched in this pass, so no contacts are listed.

#### 20. Borgata Sportsbook
- **Parent:** Borgata online sports and casino run under BetMGM. theborgata.com redirects to borgata.mgmresorts.com (MGM Resorts).
- **Affiliate program:** https://www.betmgmpartners.com/ (the same portal as BetMGM)
- **Platform:** BetMGM Partners.

| Channel | Contact | Source | Confidence |
|---|---|---|---|
| affiliate | partners@betmgm.com | https://www.betmgmpartners.com/gvcHelp.do | verified |
| press | press@betmgm.com | https://www.betmgminc.com/who-we-are/press-room/ | likely |

Notes: The BetMGM Partners FAQ lists Borgata Sports, Casino and Poker as program brands. Approach Borgata through BetMGM, not separately. Using BetMGM's press address for Borgata online is an inference, which is why that row is marked "likely".

#### 21. Novig
- **Parent:** Novig
- **Affiliate program:** Not found. There is only a Refer-a-Friend program.
- **Platform:** Not found.

No partnerships, affiliate or press email is published. The newsroom (https://novig.com/newsroom) links a Press Kit and Customer Support only. Per its newsroom, Novig is now a CFTC-approved prediction market (DCM), not a state-licensed sportsbook. A LinkedIn approach is the realistic route.

#### 22. ProphetX
- **Parent:** ProphetX (Prophet Exchange)
- **Affiliate program:** Not found. Only a third-party-documented Refer-a-Friend program exists.
- **Platform:** Not found.

| Channel | Contact | Source | Confidence |
|---|---|---|---|
| form (support) | https://prophethelp.zendesk.com/hc/en-us/requests/new | https://www.prophetx.co/ | verified |

Notes: This Zendesk help desk is the only published contact channel, and it is mainly for support. ProphetX calls itself "America's #1 Sports Prediction Market".

#### 23. Fliff
- **Parent:** Fliff, Inc.
- **Affiliate program:** Not found.
- **Platform:** Not found.

| Channel | Contact | Source | Confidence |
|---|---|---|---|
| press | press@getfliff.com | https://www.getfliff.com/contact | verified |

Notes: The address is the footer's "Media Inquiries" link. The `/contact` form is for customer support. Fliff is a social or sweepstakes sportsbook, not a licensed real-money sportsbook.

#### 24. Betr
- **Parent:** Betr (Miami, FL)
- **Affiliate program:** https://www.betr.app/betr-partner-application
- **Platform:** Betr's own promo-code program. Applications go through a Google Form titled "Betr Affiliate Application".

| Channel | Contact | Source | Confidence |
|---|---|---|---|
| affiliate (form) | https://docs.google.com/forms/d/e/1FAIpQLSch0GPejNUUY0hh3Z06TnjmtdlytIUmB_1tnovKYM11Je4gYQ/viewform | https://www.betr.app/betr-partner-application | verified |

Notes: Betr's products are Fantasy Pick'em, Social Sportsbook, Social Casino and Arcade, so it is not a real-money sportsbook. `support@betr.app` is customer support and is left out.

#### 25. ReBet
Not researched in this pass, so no contacts are listed.

#### 26. Courtside
Not researched in this pass, so no contacts are listed.

#### 27. BetOpenly
Not researched in this pass, so no contacts are listed.

#### 28. Dabble
Not researched in this pass, so no contacts are listed.

---

## Researched but not in the traffic ranking

#### Betway (low priority: has left the US)
- **Parent:** Super Group (SGHC) Ltd
- **Affiliate program:** https://www.superpartners.com/ (`betwaypartners.com` redirects here)
- **Platform:** Super Group's own Super Partners portal (account.superpartners.com).

| Channel | Contact | Source | Confidence |
|---|---|---|---|
| affiliate (form) | https://account.superpartners.com/?form=ContactUs | https://www.superpartners.com/ | verified |
| partnerships/b2b | corp.dev@supergroup.com | https://supergroup.com/contact/ | verified |
| press | media@supergroup.com | https://supergroup.com/contact/ | verified |

Notes:
- Super Group closed its US sportsbook in all nine states where it was live, per iGaming Business on 10 Jul 2024. It then exited US iGaming, per CasinoBeats on 9 Jul 2025.
- `corp.dev@` is labelled "Corporate Development and Investment Banking Contact".

#### Sporttrade
- **Parent:** Sporttrade
- **Affiliate program:** Not found.
- **Platform:** Not found.

| Channel | Contact | Source | Confidence |
|---|---|---|---|
| partnerships/b2b | info@getsporttrade.com | https://getsporttrade.com/contact/ | verified |
| press | media@getsporttrade.com | https://getsporttrade.com/contact/ | verified |

Notes: The contact page says "For general queries, including partnership opportunities, please email" the `info@` address. Both addresses are protected by Cloudflare email obfuscation on the page and were decoded to read them. Sporttrade now presents itself as market technology ("For FCMs"), so it may be of limited use for consumer betslips.

---

## Gaps to close next

- **Not researched:** Kalshi, Polymarket US, Underdog, PrizePicks, Betly, ReBet, Courtside, BetOpenly and Dabble.
- **No published business channel:** FanDuel (affiliate program), Hard Rock Bet and Novig.
- **Re-check from a normal browser:** `affiliates@CaesarsInteractive.com`. The site's bot protection blocked every automated fetch.
- **Ask during affiliate onboarding:** whether bet365 Partners accepts US traffic.
