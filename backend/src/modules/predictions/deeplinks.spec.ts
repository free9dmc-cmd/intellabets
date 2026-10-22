import {
  buildBetslipLink,
  EXCLUDED_BOOK_KEYS,
  getSportsbook,
  hostAllowed,
  normalizeState,
  SPORTSBOOKS,
  validateBookUrl,
  isRoutableBook,
} from "./deeplinks"

// Real link shapes from Odds API output, as cited in deeplinks.ts.
const FD_LINK = "https://sportsbook.fanduel.com/addToBetslip?marketId=42.448600011&selectionId=29165"
const MGM_LINK =
  "https://sports.{state}.betmgm.com/en/sports?options=17571143-1312755715--572869586&type=Single"
const CZR_LINK =
  "https://sportsbook.caesars.com/us/{state}/bet/betslip?selectionIds=d5703855-6437-36b5-b3f3-2a20aaf9699a"
const BR_LINK =
  "https://{state}.betrivers.com/?page=sportsbook#event/1023475244?coupon={pickType}|3720886157|{wagerAmount}"

describe("registry", () => {
  it("is ordered by traffic rank, tier 1 first", () => {
    const ranks = SPORTSBOOKS.map((b) => b.trafficRank)
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
    const tiers = SPORTSBOOKS.map((b) => b.tier)
    expect(tiers.indexOf(2)).toBeGreaterThan(tiers.lastIndexOf(1))
    expect(SPORTSBOOKS[0].key).toBe("fanduel")
    expect(SPORTSBOOKS[1].key).toBe("draftkings")
  })

  it("has unique keys, https home pages inside each book's allowlist, and only allowed kinds", () => {
    const keys = SPORTSBOOKS.map((b) => b.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const b of SPORTSBOOKS) {
      expect(validateBookUrl(b.homeUrl, b)).not.toBeNull()
      expect(["sportsbook", "exchange", "sweepstakes"]).toContain(b.kind)
      expect(b.sources.length).toBeGreaterThan(0)
      for (const st of b.states ?? []) {
        expect(normalizeState(st)).toBe(st)
        if (b.stateHomeUrl) {
          const slug = b.stateSlug ? b.stateSlug(st) : st
          expect(validateBookUrl(b.stateHomeUrl(slug), b)).not.toBeNull()
        }
      }
    }
  })

  it("leaves offshore and other excluded keys out of the registry", () => {
    for (const k of EXCLUDED_BOOK_KEYS) {
      expect(SPORTSBOOKS.find((b) => b.key === k)).toBeUndefined()
      expect(getSportsbook(k)).toBeNull()
    }
  })

  it("is case-insensitive on key lookup", () => {
    expect(getSportsbook("FanDuel")?.key).toBe("fanduel")
  })
})

describe("offshore and unknown books", () => {
  it.each(["bovada", "betonlineag", "mybookieag", "betus", "lowvig", "betanysports", "polymarket", "betopenly", "limitless"])(
    "%s returns null even with a provider link",
    (key) => {
      expect(buildBetslipLink(key, { providerLink: "https://www.bovada.lv/sports", outcomeSid: "123" })).toBeNull()
    }
  )

  it("returns null for unknown or empty keys", () => {
    expect(buildBetslipLink("somebook", { providerLink: FD_LINK })).toBeNull()
    expect(buildBetslipLink("", {})).toBeNull()
    expect(buildBetslipLink(null, {})).toBeNull()
  })
})

describe("hostAllowed", () => {
  const allow = ["sportsbook.fanduel.com"]
  it("accepts the exact host and subdomains", () => {
    expect(hostAllowed("sportsbook.fanduel.com", allow)).toBe(true)
    expect(hostAllowed("nj.sportsbook.fanduel.com", allow)).toBe(true)
    expect(hostAllowed("SPORTSBOOK.FANDUEL.COM", allow)).toBe(true)
  })
  it("rejects look-alike hosts", () => {
    expect(hostAllowed("evil-sportsbook.fanduel.com.attacker.io", allow)).toBe(false)
    expect(hostAllowed("evilsportsbook.fanduel.com", allow)).toBe(false)
    expect(hostAllowed("fanduel.com", allow)).toBe(false)
    expect(hostAllowed("sportsbook.fanduel.co", allow)).toBe(false)
    expect(hostAllowed("evil-fanduel.com", ["fanduel.com"])).toBe(false)
    expect(hostAllowed("nj.sportsbook.fanduel.com", ["fanduel.com"])).toBe(true)
  })
})

describe("validateBookUrl", () => {
  const fd = getSportsbook("fanduel")!
  it("accepts a normal https link", () => {
    expect(validateBookUrl(FD_LINK, fd)).toBe(FD_LINK)
  })
  it.each([
    ["http scheme", "http://sportsbook.fanduel.com/addToBetslip?selectionId=1"],
    ["javascript scheme", "javascript:alert(1)//sportsbook.fanduel.com"],
    ["data scheme", "data:text/html,<script>alert(1)</script>"],
    ["protocol-relative", "//sportsbook.fanduel.com/"],
    ["credentials", "https://user:pw@sportsbook.fanduel.com/"],
    ["username only", "https://sportsbook.fanduel.com@evil.com/"],
    ["non-default port", "https://sportsbook.fanduel.com:8443/"],
    ["look-alike host", "https://sportsbook.fanduel.com.evil.com/addToBetslip"],
    ["trailing-dot host", "https://sportsbook.fanduel.com./addToBetslip?selectionId=1"],
    ["backslash authority trick", "https://evil.com\\@sportsbook.fanduel.com/"],
    ["host hidden in fragment", "https://evil.com#.sportsbook.fanduel.com"],
    ["other host", "https://evil-fanduel.com/"],
    ["unfilled placeholder", "https://sportsbook.fanduel.com/?x={state}"],
    ["encoded placeholder", "https://sportsbook.fanduel.com/?x=%7Bstate%7D"],
    ["embedded newline", "https://sportsbook.fanduel.com/\nfoo"],
    ["embedded tab", "https://sportsbook.fan\tduel.com/"],
    ["empty", ""],
    ["not a url", "not a url"],
    ["too long", `https://sportsbook.fanduel.com/?q=${"a".repeat(3000)}`],
  ])("rejects %s", (_label, url) => {
    expect(validateBookUrl(url, fd)).toBeNull()
  })
  it("rejects non-strings", () => {
    expect(validateBookUrl(undefined, fd)).toBeNull()
    expect(validateBookUrl(42, fd)).toBeNull()
  })
})

describe("normalizeState", () => {
  it("accepts US state codes in any case", () => {
    expect(normalizeState("NJ")).toBe("nj")
    expect(normalizeState(" pa ")).toBe("pa")
    expect(normalizeState("dc")).toBe("dc")
  })
  it("rejects anything else", () => {
    expect(normalizeState("zz")).toBeNull()
    expect(normalizeState("new jersey")).toBeNull()
    expect(normalizeState("n.")).toBeNull()
    expect(normalizeState("nj.evil.com")).toBeNull()
    expect(normalizeState(null)).toBeNull()
    expect(normalizeState(undefined)).toBeNull()
  })
})

describe("provider links", () => {
  it("uses a valid FanDuel outcome link as the betslip", () => {
    expect(buildBetslipLink("fanduel", { providerLink: FD_LINK })).toEqual({
      url: FD_LINK,
      kind: "betslip",
      source: "provider",
    })
  })

  it("accepts a legacy FanDuel state host", () => {
    const url = "https://nj.sportsbook.fanduel.com/addToBetslip?marketId=1.2&selectionId=3"
    expect(buildBetslipLink("fanduel", { providerLink: url })?.url).toBe(url)
  })

  it("rejects a provider link pointing at another book and falls through", () => {
    const r = buildBetslipLink("fanduel", {
      providerLink: "https://sportsbook.draftkings.com/?outcomes=1",
    })
    expect(r).toEqual({ url: "https://sportsbook.fanduel.com/", kind: "home", source: "fallback" })
  })

  it("rejects javascript: and http provider links", () => {
    expect(buildBetslipLink("fanduel", { providerLink: "javascript:alert(1)" })?.kind).toBe("home")
    expect(buildBetslipLink("fanduel", { providerLink: FD_LINK.replace("https", "http") })?.kind).toBe("home")
  })

  it("fills {state} for BetMGM when the state is known", () => {
    const r = buildBetslipLink("betmgm", { providerLink: MGM_LINK, state: "NJ" })
    expect(r).toEqual({
      url: "https://sports.nj.betmgm.com/en/sports?options=17571143-1312755715--572869586&type=Single",
      kind: "betslip",
      source: "provider",
    })
  })

  it("does not use a {state} link without a state, and falls back to home", () => {
    expect(buildBetslipLink("betmgm", { providerLink: MGM_LINK })).toEqual({
      url: "https://sports.betmgm.com/",
      kind: "home",
      source: "fallback",
    })
  })

  it("does not fill {state} with a state the book is not verified in", () => {
    expect(buildBetslipLink("betmgm", { providerLink: MGM_LINK, state: "TX" })?.kind).toBe("home")
    expect(buildBetslipLink("betmgm", { providerLink: MGM_LINK, state: "zz" })?.kind).toBe("home")
  })

  it("cannot be steered to another host through the state value", () => {
    const r = buildBetslipLink("betmgm", { providerLink: MGM_LINK, state: "evil.com/x" })
    expect(r?.url).toBe("https://sports.betmgm.com/")
  })

  it("fills the Caesars {state} path segment", () => {
    expect(buildBetslipLink("williamhill_us", { providerLink: CZR_LINK, state: "ny" })?.url).toBe(
      "https://sportsbook.caesars.com/us/ny/bet/betslip?selectionIds=d5703855-6437-36b5-b3f3-2a20aaf9699a"
    )
  })

  it("fills BetRivers {state}, {pickType} and {wagerAmount}", () => {
    expect(buildBetslipLink("betrivers", { providerLink: BR_LINK, state: "PA" })).toEqual({
      url: "https://pa.betrivers.com/?page=sportsbook#event/1023475244?coupon=single|3720886157|",
      kind: "betslip",
      source: "provider",
    })
  })

  it("maps Delaware to the BetRivers delawarepark host", () => {
    expect(buildBetslipLink("betrivers", { providerLink: BR_LINK, state: "DE" })?.url).toBe(
      "https://delawarepark.betrivers.com/?page=sportsbook#event/1023475244?coupon=single|3720886157|"
    )
  })

  it("accepts theScore Bet and Hard Rock links on their own hosts only", () => {
    const score =
      "https://sportsbook.thescore.bet/?market_selection_id[0]=9b1c1e0a-1111-2222-3333-444455556666&odds_numerator[0]=2&odds_denominator[0]=1"
    expect(buildBetslipLink("espnbet", { providerLink: score })?.source).toBe("provider")
    expect(buildBetslipLink("espnbet", { providerLink: "https://espnbet.com/x" })?.kind).toBe("home")
    const hr = "https://app.hardrock.bet/?deep_link_value=betslip/7633691097706529027"
    expect(buildBetslipLink("hardrockbet_fl", { providerLink: hr })).toEqual({
      url: hr,
      kind: "betslip",
      source: "provider",
    })
  })
})

describe("template builders", () => {
  it("FanDuel: marketSid + outcomeSid", () => {
    expect(buildBetslipLink("fanduel", { marketSid: "42.448600011", outcomeSid: "29165" })).toEqual({
      url: FD_LINK,
      kind: "betslip",
      source: "template",
    })
  })

  it("FanDuel: needs both ids", () => {
    expect(buildBetslipLink("fanduel", { outcomeSid: "29165" })?.kind).toBe("home")
  })

  it("DraftKings: encodes '#' in outcome ids", () => {
    expect(buildBetslipLink("draftkings", { outcomeSid: "0QA254735339#256882417_13L84240Q1-1379044839Q20" })).toEqual({
      url: "https://sportsbook.draftkings.com/?outcomes=0QA254735339%23256882417_13L84240Q1-1379044839Q20",
      kind: "betslip",
      source: "template",
    })
  })

  it("BetMGM: options={fixture}-{market}-{option} with a state", () => {
    expect(
      buildBetslipLink("betmgm", { eventSid: "17571143", marketSid: "1312755715", outcomeSid: "-572869586", state: "mi" })
    ).toEqual({
      url: "https://sports.mi.betmgm.com/en/sports?options=17571143-1312755715--572869586&type=Single",
      kind: "betslip",
      source: "template",
    })
  })

  it("BetMGM: without a state the template is skipped", () => {
    expect(
      buildBetslipLink("betmgm", { eventSid: "17571143", marketSid: "1312755715", outcomeSid: "-572869586" })?.kind
    ).toBe("home")
  })

  it("BetMGM: encodes ':' in prefixed fixture ids", () => {
    expect(
      buildBetslipLink("betmgm", { eventSid: "2:7828205", marketSid: "1", outcomeSid: "2", state: "nj" })?.url
    ).toBe("https://sports.nj.betmgm.com/en/sports?options=2%3A7828205-1-2&type=Single")
  })

  it("BetMGM: skips the template when an id contains the '-' separator", () => {
    expect(
      buildBetslipLink("betmgm", { eventSid: "1-2", marketSid: "3", outcomeSid: "4", state: "nj" })?.kind
    ).toBe("home")
    expect(
      buildBetslipLink("betmgm", { eventSid: "1", marketSid: "3", outcomeSid: "4-5", state: "nj" })?.kind
    ).toBe("home")
  })

  it("Caesars: selectionIds with a state", () => {
    expect(
      buildBetslipLink("williamhill_us", { outcomeSid: "d5703855-6437-36b5-b3f3-2a20aaf9699a", state: "nj" })
    ).toEqual({
      url: "https://sportsbook.caesars.com/us/nj/bet/betslip?selectionIds=d5703855-6437-36b5-b3f3-2a20aaf9699a",
      kind: "betslip",
      source: "template",
    })
  })

  it("BetRivers: no SID template (unsourced mapping), so SIDs alone never claim a betslip", () => {
    expect(buildBetslipLink("betrivers", { eventSid: "1023475244", outcomeSid: "3720886157", state: "nj" })).toEqual({
      url: "https://nj.betrivers.com/?page=sportsbook",
      kind: "home",
      source: "fallback",
    })
  })

  it("Hard Rock (base key): betslip/{outcomeSid}", () => {
    expect(buildBetslipLink("hardrockbet", { outcomeSid: "7633691097706529027" })).toEqual({
      url: "https://app.hardrock.bet/?deep_link_value=betslip/7633691097706529027",
      kind: "betslip",
      source: "template",
    })
  })

  it("books without a sourced template do not build one from sids", () => {
    for (const key of ["fanatics", "espnbet", "hardrockbet_az", "ballybet", "betparx", "kalshi", "fliff"]) {
      expect(buildBetslipLink(key, { outcomeSid: "123", marketSid: "456", eventSid: "789", state: "nj" })?.kind).toBe(
        "home"
      )
    }
  })

  it.each([
    ["path traversal", "../../evil"],
    ["slash", "123/456"],
    ["query injection", "1&evil=1"],
    ["fragment injection", "1#x"],
    ["whitespace", "1 2"],
    ["too long", "1".repeat(129)],
    ["empty", ""],
  ])("skips the template for an id with %s", (_label, bad) => {
    expect(buildBetslipLink("hardrockbet", { outcomeSid: bad })?.kind).toBe("home")
    expect(buildBetslipLink("fanduel", { marketSid: "1.2", outcomeSid: bad })?.kind).toBe("home")
  })

  it("DraftKings allows '#' but still rejects other unsafe characters", () => {
    expect(buildBetslipLink("draftkings", { outcomeSid: "1&x=2" })?.kind).toBe("home")
    expect(buildBetslipLink("draftkings", { outcomeSid: "a/b" })?.kind).toBe("home")
  })
})

describe("fallback chain", () => {
  it("provider beats template", () => {
    const r = buildBetslipLink("fanduel", {
      providerLink: "https://sportsbook.fanduel.com/addToBetslip?marketId=9.9&selectionId=9",
      marketSid: "1.1",
      outcomeSid: "1",
    })
    expect(r?.source).toBe("provider")
    expect(r?.url).toContain("selectionId=9")
  })

  it("template beats event link", () => {
    const r = buildBetslipLink("hardrockbet", {
      outcomeSid: "1",
      eventLink: "https://app.hardrock.bet/home/competition/mlb/5403355303272120730",
    })
    expect(r).toMatchObject({ kind: "betslip", source: "template" })
  })

  it("uses the market link, then the event link, when no betslip can be built", () => {
    const eventLink = "https://sportsbook.fanduel.com/baseball/mlb/a-%40-b-33617147"
    expect(buildBetslipLink("fanduel", { eventLink })).toEqual({ url: eventLink, kind: "event", source: "provider" })
    const marketLink = "https://sportsbook.fanduel.com/baseball/mlb/a-%40-b-33617147?tab=popular"
    expect(buildBetslipLink("fanduel", { marketLink, eventLink })?.url).toBe(marketLink)
  })

  it("fills {state} in event links too", () => {
    const r = buildBetslipLink("betrivers", {
      eventLink: "https://{state}.betrivers.com/?page=sportsbook#event/1023475244",
      state: "oh",
    })
    expect(r).toEqual({
      url: "https://oh.betrivers.com/?page=sportsbook#event/1023475244",
      kind: "event",
      source: "provider",
    })
  })

  it("rejects an event link on a foreign host and goes home", () => {
    expect(buildBetslipLink("fanatics", { eventLink: "https://evil.com/fanatics" })).toEqual({
      url: "https://sportsbook.fanatics.com/",
      kind: "home",
      source: "fallback",
    })
  })

  it("uses a state home page when the state is known", () => {
    expect(buildBetslipLink("williamhill_us", { state: "nj" })?.url).toBe("https://sportsbook.caesars.com/us/nj/bet/")
    expect(buildBetslipLink("betmgm", { state: "pa" })?.url).toBe("https://sports.pa.betmgm.com/en/sports")
    // betPARX state hosts redirect to the casino, so every state gets the main site.
    expect(buildBetslipLink("betparx", { state: "nj" })?.url).toBe("https://www.betparx.com/")
    expect(buildBetslipLink("betparx", { state: "mi" })?.url).toBe("https://www.betparx.com/")
  })

  it("gives every registered book at least a home link", () => {
    for (const b of SPORTSBOOKS) {
      const r = buildBetslipLink(b.key, {})
      expect(r).toMatchObject({ kind: "home", source: "fallback" })
      expect(r!.url.startsWith("https://")).toBe(true)
    }
  })
})


describe("isRoutableBook", () => {
  const saved = process.env.INCLUDE_NON_SPORTSBOOK_VENUES
  afterEach(() => {
    if (saved === undefined) delete process.env.INCLUDE_NON_SPORTSBOOK_VENUES
    else process.env.INCLUDE_NON_SPORTSBOOK_VENUES = saved
  })

  it("allows registered sportsbooks", () => {
    for (const k of ["fanduel", "draftkings", "betmgm", "williamhill_us", "FanDuel"]) {
      expect(isRoutableBook(k)).toBe(true)
    }
  })

  it("never allows offshore, unregistered or empty keys", () => {
    delete process.env.INCLUDE_NON_SPORTSBOOK_VENUES
    for (const k of ["bovada", "BetOnlineAG", "mybookieag", "lowvig", "somebook", "", null, undefined]) {
      expect(isRoutableBook(k)).toBe(false)
    }
    process.env.INCLUDE_NON_SPORTSBOOK_VENUES = "true"
    expect(isRoutableBook("bovada")).toBe(false)
  })

  it("keeps exchanges and sweepstakes apps off unless explicitly enabled", () => {
    delete process.env.INCLUDE_NON_SPORTSBOOK_VENUES
    expect(isRoutableBook("kalshi")).toBe(false)
    expect(isRoutableBook("fliff")).toBe(false)
    process.env.INCLUDE_NON_SPORTSBOOK_VENUES = "TRUE"
    expect(isRoutableBook("kalshi")).toBe(false) // exact "true" only
    process.env.INCLUDE_NON_SPORTSBOOK_VENUES = "true"
    expect(isRoutableBook("kalshi")).toBe(true)
    expect(isRoutableBook("fliff")).toBe(true)
  })
})
