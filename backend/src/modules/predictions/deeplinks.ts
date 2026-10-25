/**
 * Sportsbook registry and betslip deep-link builder.
 *
 * Each pick's "Compare sportsbooks" panel has an "Open betslip" button per book.
 * This module decides which URL that button opens. It tries, in this order:
 *
 *   (a) the link The Odds API returned for this outcome (includeLinks=true), if
 *       it passes validation, after filling any {state} placeholder,
 *   (b) a betslip URL built from the bookmaker ids (includeSids=true) with a
 *       template whose format comes from a cited source,
 *   (c) an event/market page link from The Odds API,
 *   (d) the book's home page (state-specific when we know the user's state),
 *   (e) null, for any key not in the registry.
 *
 * This only builds links. IntellaBets does not place bets, log into accounts,
 * or hold funds; the user confirms every bet themselves at the book.
 *
 * SECURITY: every URL returned has passed `validateBookUrl`. It must be https,
 * carry no credentials, use the default port, and its host must be one of the
 * book's `allowedHosts` (exact match or a subdomain of it). Ids substituted into
 * templates must match a strict pattern and are URL-encoded. A provider link
 * that still holds a placeholder after substitution is rejected.
 *
 * Research sources (fetched 2026-10-22) are cited next to each entry. Where an
 * id mapping is not confirmed, the comment says so.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type BookKind = "sportsbook" | "exchange" | "sweepstakes"
export type LinkKind = "betslip" | "event" | "home"
export type LinkSource = "provider" | "template" | "fallback"

export interface DeepLinkContext {
  /** outcome.link from The Odds API (the betslip-level link). */
  providerLink?: string | null
  /** outcome.sid from The Odds API. */
  outcomeSid?: string | null
  /** market.sid from The Odds API. */
  marketSid?: string | null
  /** market.link from The Odds API. */
  marketLink?: string | null
  /** bookmaker-level sid (the event at that book). */
  eventSid?: string | null
  /** bookmaker-level link (the event page at that book). */
  eventLink?: string | null
  /** The user's 2-letter US state, e.g. "NJ". Needed by state-hosted books. */
  state?: string | null
}

export interface DeepLink {
  url: string
  kind: LinkKind
  source: LinkSource
}

/** Ids that have passed validation, ready to be encoded into a template. */
type TemplateIds = {
  outcomeSid?: string
  marketSid?: string
  eventSid?: string
  /** lowercase state slug for this book (already validated) */
  state?: string
}

interface BetslipTemplate {
  /** Returns the unencoded URL, or null when a required id is missing. */
  build: (ids: TemplateIds, enc: (v: string) => string) => string | null
  /**
   * "observed": the sid -> URL-param mapping was seen in real Odds API output.
   * "assumed": the URL format is sourced, but which sid fills which param is
   * not confirmed. Such templates can produce a link that opens the book
   * without filling the slip.
   */
  idMapping: "observed" | "assumed"
  source: string
}

export interface SportsbookEntry {
  /** The Odds API bookmaker key. */
  key: string
  name: string
  tier: 1 | 2
  /** 1 = most traffic. Several keys of one brand share a rank. */
  trafficRank: number
  kind: BookKind
  /** Home page used when no state is known. */
  homeUrl: string
  /** Home page for a state, when the book uses state hosts or paths. */
  stateHomeUrl?: (stateSlug: string) => string
  /** Host suffixes a link for this book may point at. */
  allowedHosts: string[]
  /**
   * When set, the book's URLs carry the user's state and only these states
   * (lowercase) are substituted. Others fall through to the plain home page.
   */
  states?: readonly string[]
  /** Maps a state code to the slug used in URLs (BetRivers Delaware). */
  stateSlug?: (state: string) => string
  /** Values for non-state placeholders the provider leaves in its links. */
  placeholderDefaults?: Record<string, string>
  /** Per-book id pattern, when the default is too strict for real ids. */
  idPattern?: RegExp
  betslip?: BetslipTemplate
  /** Multi-selection betslip (parlay) link; only for books with a sourced format. */
  parlay?: ParlayTemplate
  sources: string[]
}

/** One parlay leg: its validated ids plus its raw Odds API outcome link. */
type ParlayLegIds = TemplateIds & { providerLink?: string }

interface ParlayTemplate {
  /** Returns the unencoded URL, or null when any leg is missing a required id. */
  build: (legs: ParlayLegIds[], enc: (v: string) => string) => string | null
  idMapping: "observed" | "assumed"
  /** Most selections the book's link accepts. */
  maxLegs: number
  source: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ODDS_API_BOOKMAKERS = "https://the-odds-api.com/sports-odds-data/bookmaker-apis.html"
const ODDS_API_DEEPLINKS = "https://the-odds-api.com/releases/deep-links.html"

/** Default pattern for an id substituted into a template. */
export const DEFAULT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

const MAX_URL_LENGTH = 2048

/** 50 states + DC + PR. */
export const US_STATES: readonly string[] = [
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia",
  "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj",
  "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt",
  "va", "wa", "wv", "wi", "wy", "dc", "pr",
]

/** Returns the lowercase 2-letter state, or null if it is not a US state code. */
export function normalizeState(state: string | null | undefined): string | null {
  if (typeof state !== "string") return null
  const s = state.trim().toLowerCase()
  return /^[a-z]{2}$/.test(s) && US_STATES.includes(s) ? s : null
}

// ─── Excluded books ───────────────────────────────────────────────────────────

/**
 * Keys The Odds API returns that we never link to and leave out of the
 * comparison panel.
 *
 * Offshore books with no US state licence. State regulators have sent them
 * cease-and-desist letters or fined them:
 *  - betonlineag: TN SWC C&D 2025-05-20
 *    https://www.tn.gov/swac/about/tennessee-sports-wagering-council-newroom/2025/5/20/swc-sends-cease-and-desist-letter-to-illegal-sportsbook-betonline.html
 *  - bovada: MGCB C&D 2024-05-30
 *    https://www.michigan.gov/mgcb/news/2024/05/30/mgcb-issues-cease-and-desist-letter-to-bovada
 *  - mybookieag: listed by TN SWC among illegal offshore books fined in 2025 (same TN page as above)
 *  - betus: MGCB C&D 2025-05-07
 *    https://www.michigan.gov/mgcb/news/2025/05/07/mgcb-orders-betus-to-halt-illegal-online-gambling-operations-in-michigan
 *  - lowvig: TN SWC C&D 2025-05-01
 *    https://www.tn.gov/swac/about/tennessee-sports-wagering-council-newroom/2025/5/1/swc-demands-illegal-sportsbook-lowvig-cease-operations-in-tennessee.html
 *  - betanysports (BetAnything): .eu site marketed to the US with no state
 *    licence found. The offshore label is inferred; no regulator action was found.
 *
 * Other exclusions:
 *  - polymarket: the international venue. polymarket.com blocks trading from
 *    the US and is not CFTC-regulated (https://polymarket.com/tos). polymarket_us is listed below.
 *  - betopenly: legal basis in the US unverified.
 *  - limitless: US entity's CFTC application is pending; not researched further.
 */
export const EXCLUDED_BOOK_KEYS: ReadonlySet<string> = new Set([
  "betonlineag",
  "bovada",
  "mybookieag",
  "betus",
  "lowvig",
  "betanysports",
  "polymarket",
  "betopenly",
  "limitless",
])

/*
 * Not in the registry because The Odds API has no US key for them, so they
 * never appear in our prices: bet365 (only bet365_au), Circa Sports, Bet Desert
 * Diamond, Betly, Borgata, Betr. Add them if another odds feed is wired in.
 * DFS pick'em keys (underdog, prizepicks, pick6, dabble_us_dfs) are in region
 * us_dfs and out of scope. Exited books (Betway, Unibet, Tipico, Betfred,
 * WynnBET, SI Sportsbook, Sporttrade) are not listed.
 */

// ─── Shared host and template helpers ─────────────────────────────────────────

const HARD_ROCK_HOSTS = ["hardrock.bet"]

/** Hard Rock betslip, observed in Odds API outcome links. */
const hardRockBetslip: BetslipTemplate = {
  // https://app.hardrock.bet/?deep_link_value=betslip/{outcomeSid}
  // URL shape, from stored Odds API outcome links:
  // https://github.com/ItsDardanRexhepi/rixpicks/blob/c5a4c783fb49727d0019cf9261ef3411363a7d29/manifests/manifest-3a60b0a2da0f.json
  // That file has no sid fields, so it does not show which id fills the slot.
  // One stored response pairing outcome.sid with the betslip number (Jun 2025):
  // https://github.com/tmash55/oddsmash/blob/25f4ef46dea5b3435fbe0f8e4a928361d6230098/REDIS_CACHE.md
  // Single sample, not tested on a device: treat a miss as "opens Hard Rock with
  // an empty slip", which is why the provider's own link is always tried first.
  build: ({ outcomeSid }, enc) =>
    outcomeSid ? `https://app.hardrock.bet/?deep_link_value=betslip/${enc(outcomeSid)}` : null,
  idMapping: "observed",
  source:
    "https://github.com/ItsDardanRexhepi/rixpicks/blob/c5a4c783fb49727d0019cf9261ef3411363a7d29/manifests/manifest-3a60b0a2da0f.json",
}

// ─── Registry (ordered by traffic rank) ───────────────────────────────────────

/**
 * Traffic ranks are from the 2026-10-22 research: tier 1 is ordered mainly by
 * US online GGR share (CasinoReports Aug 2026, Flutter Q2 2026 8-K, EKG
 * monitors). Ranks 3-5 are uncertain because Florida, Hard Rock's exclusive
 * market, publishes no operator data. Tier 2 below BetRivers and theScore is
 * grouped by category, not by measured share.
 */
export const SPORTSBOOKS: readonly SportsbookEntry[] = [
  // ── Tier 1 ──
  {
    key: "fanduel",
    name: "FanDuel",
    tier: 1,
    trafficRank: 1,
    kind: "sportsbook",
    homeUrl: "https://sportsbook.fanduel.com",
    allowedHosts: ["sportsbook.fanduel.com"],
    betslip: {
      // Format from The Odds API's official deep-link example:
      // https://sportsbook.fanduel.com/addToBetslip?marketId=42.448600011&selectionId=29165
      // outcome.sid = selectionId (observed in that example). The market sid
      // was null there, so marketSid -> marketId is ASSUMED.
      build: ({ marketSid, outcomeSid }, enc) =>
        marketSid && outcomeSid
          ? `https://sportsbook.fanduel.com/addToBetslip?marketId=${enc(marketSid)}&selectionId=${enc(outcomeSid)}`
          : null,
      idMapping: "assumed",
      source: ODDS_API_DEEPLINKS,
    },
    parlay: {
      // Multi-leg addToBetslip: 0-based marketId[i]/selectionId[i] pairs. Format from
      // FanDuel's own web client (main bundle + DeepLinkAddToBetSlipScreen chunk, fetched
      // 2026-10-25), which parses name[i] keys into pairs and also generates these links.
      // FanDuel's market.sid is null in Odds API data, so each pair is copied from that
      // leg's own outcome.link (observed shape), and its selectionId must equal outcome.sid.
      build: (legs) => {
        const pairs = allOrNull(
          legs.map((l) => {
            const marketId = linkParam(l.providerLink, "marketId")
            const selectionId = linkParam(l.providerLink, "selectionId")
            if (!marketId || !selectionId) return null
            if (!/^\d{1,4}\.\d{1,15}$/.test(marketId) || !/^\d{1,15}$/.test(selectionId)) return null
            if (l.outcomeSid && l.outcomeSid !== selectionId) return null
            return { marketId, selectionId }
          })
        )
        if (!pairs) return null
        const query = pairs.map((p, i) => `marketId[${i}]=${p.marketId}&selectionId[${i}]=${p.selectionId}`).join("&")
        return `https://sportsbook.fanduel.com/addToBetslip?${query}`
      },
      idMapping: "observed",
      maxLegs: 12,
      source: "https://sportsbook.fanduel.com/ (web client DeepLinkAddToBetSlipScreen, 2026-10-25)",
    },
    sources: [ODDS_API_DEEPLINKS, ODDS_API_BOOKMAKERS],
  },
  {
    key: "draftkings",
    name: "DraftKings",
    tier: 1,
    trafficRank: 2,
    kind: "sportsbook",
    homeUrl: "https://sportsbook.draftkings.com",
    allowedHosts: ["sportsbook.draftkings.com"],
    // DraftKings outcome ids can contain '#', e.g. 0QA254735339#256882417_13L84240Q1-1379044839Q20.
    // It is encoded as %23.
    idPattern: /^[A-Za-z0-9._:#-]{1,128}$/,
    betslip: {
      // https://sportsbook.draftkings.com/?outcomes={outcomeSid}. This is the Sept 2026 shape
      // of Odds API outcome links (shape only; these files carry no sid fields):
      // https://github.com/ItsDardanRexhepi/rixpicks/blob/c5a4c783fb49727d0019cf9261ef3411363a7d29/manifests/manifest-3a60b0a2da0f.json
      // https://github.com/CoghillB/ApeOffside/blob/922714cfeb8b178e6f0b8eba120e08c468400200/server/odds/utils/sample_responses.py
      // outcome.sid equals the outcomes= value in stored responses here:
      // https://github.com/tmash55/oddsmash/blob/25f4ef46dea5b3435fbe0f8e4a928361d6230098/REDIS_CACHE.md
      build: ({ outcomeSid }, enc) =>
        outcomeSid ? `https://sportsbook.draftkings.com/?outcomes=${enc(outcomeSid)}` : null,
      idMapping: "observed",
      source:
        "https://github.com/ItsDardanRexhepi/rixpicks/blob/c5a4c783fb49727d0019cf9261ef3411363a7d29/manifests/manifest-3a60b0a2da0f.json",
    },
    parlay: {
      // Several outcome ids in one outcomes= value, joined by a literal "+". DraftKings
      // publishes "+ Add to Bet Slip" parlay buttons in exactly this form, e.g.
      // https://dknetwork.draftkings.com/2026/10/24/nfl-week-7-touchdown-scorer-parlays/
      // and its web betslip (betslip/2633.4.1/dkBetSlip.js) splits outcomes= on "+"
      // and caps a slip at 20 selections. outcome.sid = the outcomes= id (observed above).
      build: (legs, enc) => {
        const sids = allOrNull(legs.map((l) => l.outcomeSid))
        return sids ? `https://sportsbook.draftkings.com/?outcomes=${sids.map(enc).join("+")}` : null
      },
      idMapping: "observed",
      maxLegs: 20,
      source: "https://dknetwork.draftkings.com/2026/10/24/nfl-week-7-touchdown-scorer-parlays/",
    },
    sources: [ODDS_API_BOOKMAKERS],
  },
  {
    // No public betslip format found. The Odds API reportedly returns only a
    // sid (unverified), so this is provider link (if any) -> home.
    key: "fanatics",
    name: "Fanatics",
    tier: 1,
    trafficRank: 3,
    kind: "sportsbook",
    homeUrl: "https://sportsbook.fanatics.com",
    allowedHosts: ["sportsbook.fanatics.com"],
    sources: [ODDS_API_BOOKMAKERS],
  },
  {
    // Base key = Indiana feed ("currently same odds as several other states").
    key: "hardrockbet",
    name: "Hard Rock Bet",
    tier: 1,
    trafficRank: 4,
    kind: "sportsbook",
    homeUrl: "https://app.hardrock.bet",
    allowedHosts: HARD_ROCK_HOSTS,
    betslip: hardRockBetslip,
    sources: [ODDS_API_BOOKMAKERS],
  },
  // State-priced Hard Rock keys. No link sample was found for these keys, so
  // there is no template: provider link (host-checked) -> home.
  {
    key: "hardrockbet_az",
    name: "Hard Rock Bet (AZ)",
    tier: 1,
    trafficRank: 4,
    kind: "sportsbook",
    homeUrl: "https://app.hardrock.bet",
    allowedHosts: HARD_ROCK_HOSTS,
    sources: [ODDS_API_BOOKMAKERS],
  },
  {
    key: "hardrockbet_fl",
    name: "Hard Rock Bet (FL)",
    tier: 1,
    trafficRank: 4,
    kind: "sportsbook",
    homeUrl: "https://app.hardrock.bet",
    allowedHosts: HARD_ROCK_HOSTS,
    sources: [ODDS_API_BOOKMAKERS],
  },
  {
    key: "hardrockbet_oh",
    name: "Hard Rock Bet (OH)",
    tier: 1,
    trafficRank: 4,
    kind: "sportsbook",
    homeUrl: "https://app.hardrock.bet",
    allowedHosts: HARD_ROCK_HOSTS,
    sources: [ODDS_API_BOOKMAKERS],
  },
  {
    key: "betmgm",
    name: "BetMGM",
    tier: 1,
    trafficRank: 5,
    kind: "sportsbook",
    // Generic home carried over from the previous BOOKS registry. The host
    // resolves (403 to our bot probe on 2026-10-22).
    homeUrl: "https://sports.betmgm.com",
    stateHomeUrl: (st) => `https://sports.${st}.betmgm.com/en/sports`,
    allowedHosts: ["betmgm.com"],
    // States whose sports.{state}.betmgm.com host resolved in our probe
    // (2026-10-22). tx, me, vt and nh did not. A resolving host does not prove
    // that BetMGM takes bets there.
    states: [
      "az", "co", "dc", "ia", "il", "in", "ks", "ky", "la", "ma", "md", "mi",
      "mo", "nc", "nj", "ny", "oh", "pa", "tn", "va", "wv", "wy",
    ],
    // '-' separates the three ids in options=, so an id may not contain one
    // except as a leading sign (option ids can be negative, e.g. -572869586).
    // Otherwise "1-2" as a fixture id would be read as two ids.
    idPattern: /^-?[A-Za-z0-9._:]{1,127}$/,
    betslip: {
      // Official BetMGM deep-link docs (TV1):
      // https://sportsapi.nj.betmgm.com/restapi/generatedeeplink.html
      //   base-url/en/sports?options={fixtureId}-{marketId}-{optionId}&type=Single
      // outcome.sid = optionId in one stored response:
      // https://github.com/tmash55/oddsmash/blob/25f4ef46dea5b3435fbe0f8e4a928361d6230098/REDIS_CACHE.md
      // eventSid -> fixtureId and marketSid -> marketId are ASSUMED, and no
      // source shows The Odds API populating BetMGM event or market sids, so
      // expect this template to stay dormant and the provider link to carry it.
      // If it ever does fire: Odds API links show prefixed fixture ids like
      // "2:7828205", which encodeURIComponent turns into "2%3A7828205" -- not
      // the observed shape. Another reason not to rely on it.
      // The affiliate param wm is left out: IntellaBets has no BetMGM affiliate id.
      build: ({ state, eventSid, marketSid, outcomeSid }, enc) =>
        state && eventSid && marketSid && outcomeSid
          ? `https://sports.${state}.betmgm.com/en/sports?options=${enc(eventSid)}-${enc(marketSid)}-${enc(outcomeSid)}&type=Single`
          : null,
      idMapping: "assumed",
      source: "https://sportsapi.nj.betmgm.com/restapi/generatedeeplink.html",
    },
    parlay: {
      // BetMGM's affiliate docs: "Multiple selections can be chained by using , as a
      // separator", e.g. ...?options=8689063-371487979-1110490716,9007445-396437496-1180454222&type=combo
      // https://sportsapi.nj.betmgm.com/restapi/generatedeeplink.html
      // Each leg's triplet is copied from its own outcome.link (observed shape
      // options=<fixture>-<market>-<option>&type=Single), so no sid mapping is assumed.
      build: (legs) => {
        const state = legs[0]?.state
        if (!state) return null
        const triplets = allOrNull(
          legs.map((l) => {
            const t = linkParam(l.providerLink, "options")
            return t && /^(?:\d{1,3}:)?\d{1,12}-\d{1,12}--?\d{1,12}(?:-\d{1,12})?$/.test(t) ? t : null
          })
        )
        return triplets ? `https://sports.${state}.betmgm.com/en/sports?options=${triplets.join(",")}&type=combo` : null
      },
      idMapping: "observed",
      maxLegs: 10,
      source: "https://sportsapi.nj.betmgm.com/restapi/generatedeeplink.html",
    },
    sources: [
      "https://sportsapi.nj.betmgm.com/restapi/generatedeeplink.html",
      ODDS_API_BOOKMAKERS,
    ],
  },
  {
    // Caesars is "williamhill_us" on The Odds API, on paid plans only.
    key: "williamhill_us",
    name: "Caesars",
    tier: 1,
    trafficRank: 6,
    kind: "sportsbook",
    homeUrl: "https://sportsbook.caesars.com",
    stateHomeUrl: (st) => `https://sportsbook.caesars.com/us/${st}/bet/`,
    allowedHosts: ["sportsbook.caesars.com"],
    // States where /us/{state}/bet/ answered 200 in our probe (2026-10-22).
    // nh, vt and tx answered 302 to the home page, which drops the selection.
    states: [
      "az", "co", "dc", "ia", "il", "in", "ks", "ky", "la", "ma", "md", "me",
      "mi", "mo", "nc", "nj", "ny", "oh", "pa", "tn", "va", "wv", "wy",
    ],
    betslip: {
      // https://sportsbook.caesars.com/us/{state}/bet/betslip?selectionIds={uuid}
      // This shape recurs in Odds API outcome links (2024-2026), e.g.
      // https://github.com/MattMorris247/CBS_Site/blob/7674672bebbdce757d5290dc22037b0ae7c063eb/assets/json/oldtest.json
      // outcome.sid -> selectionIds is ASSUMED. The research expects the same UUID but did not confirm it.
      build: ({ state, outcomeSid }, enc) =>
        state && outcomeSid
          ? `https://sportsbook.caesars.com/us/${state}/bet/betslip?selectionIds=${enc(outcomeSid)}`
          : null,
      idMapping: "assumed",
      source:
        "https://github.com/MattMorris247/CBS_Site/blob/7674672bebbdce757d5290dc22037b0ae7c063eb/assets/json/oldtest.json",
    },
    parlay: {
      // selectionIds takes several comma-separated selection UUIDs: Caesars' own web client
      // (main.4cfea7ea.js behind /us/nj/bet/betslip, fetched 2026-10-25) reads every
      // selectionIds value on its /betslip route. Each UUID is copied from that leg's own
      // outcome.link (observed shape), so no sid mapping is assumed.
      build: (legs) => {
        const state = legs[0]?.state
        if (!state) return null
        const uuids = allOrNull(
          legs.map((l) => {
            const v = linkParam(l.providerLink, "selectionIds")
            return v && UUID.test(v) ? v : null
          })
        )
        return uuids ? `https://sportsbook.caesars.com/us/${state}/bet/betslip?selectionIds=${uuids.join(",")}` : null
      },
      idMapping: "observed",
      maxLegs: 10,
      source: "https://sportsbook.caesars.com/us/nj/bet/betslip (web client main.4cfea7ea.js, 2026-10-25)",
    },
    sources: [ODDS_API_BOOKMAKERS],
  },

  // ── Tier 2 ──
  {
    key: "betrivers",
    name: "BetRivers",
    tier: 2,
    trafficRank: 8,
    kind: "sportsbook",
    // Generic home carried over from the previous registry. In our probe it
    // answered 302 to a state site.
    homeUrl: "https://betrivers.com",
    stateHomeUrl: (st) => `https://${st}.betrivers.com/?page=sportsbook`,
    allowedHosts: ["betrivers.com"],
    // Hosts that answered 200 for ?page=sportsbook in our probe (2026-10-22).
    // Delaware uses delawarepark.betrivers.com.
    states: ["az", "co", "de", "ia", "il", "in", "la", "md", "mi", "nj", "ny", "oh", "pa", "va", "wv"],
    stateSlug: (st) => (st === "de" ? "delawarepark" : st),
    // The Odds API leaves {pickType} and {wagerAmount} in BetRivers links.
    // Other developers fill them with "single" and an empty stake.
    placeholderDefaults: { pickType: "single", wagerAmount: "" },
    // No betslip template. A Kambi coupon fragment was built here from SIDs,
    // but a source audit (2026-10-22) found it unsupported: the cited sample
    //   https://github.com/CoghillB/ApeOffside/blob/922714cfeb8b178e6f0b8eba120e08c468400200/server/odds/utils/sample_responses.py
    // shows ...#event/{id}?coupon={pickType}|{outcomeId}|{wagerAmount} straight
    // from The Odds API, and no sample anywhere shows BetRivers sids, so neither
    // id mapping had evidence. BetRivers keeps the provider's own link (with the
    // placeholders filled above), then the event page, then the state home.
    sources: [ODDS_API_BOOKMAKERS],
  },
  {
    // Still keyed "espnbet" on The Odds API; rebranded theScore Bet 2025-12-01.
    // The outcome link carries odds_numerator/odds_denominator values that look
    // like filler, so there is no template; we rely on the provider link only.
    // A third-party on-device test reports the native app ignores the slip
    // params. espnbet.com is not allowed (TLS failed on 2026-10-22).
    key: "espnbet",
    name: "theScore Bet",
    tier: 2,
    trafficRank: 9,
    kind: "sportsbook",
    homeUrl: "https://sportsbook.thescore.bet",
    allowedHosts: ["sportsbook.thescore.bet"],
    sources: [
      ODDS_API_BOOKMAKERS,
      "https://cdcgaming.com/brief/a-new-dawn-for-penn-espn-bet-is-replaced-with-thescore-bet/",
    ],
  },
  // CFTC-regulated prediction markets. Several states contest them, so they
  // need legal review and geo-gating before launch. Home links only. A Kalshi
  // market URL needs Kalshi's own series ticker, which The Odds API does not give us.
  {
    key: "kalshi",
    name: "Kalshi",
    tier: 2,
    trafficRank: 10,
    kind: "exchange",
    homeUrl: "https://kalshi.com",
    allowedHosts: ["kalshi.com"],
    sources: [ODDS_API_BOOKMAKERS, "https://help.kalshi.com/en/articles/13823765-how-is-kalshi-regulated"],
  },
  {
    key: "polymarket_us",
    name: "Polymarket US",
    tier: 2,
    trafficRank: 11,
    kind: "exchange",
    homeUrl: "https://polymarket.us",
    allowedHosts: ["polymarket.us"],
    sources: [ODDS_API_BOOKMAKERS, "https://polymarket.us/"],
  },
  // Smaller state-licensed sportsbooks. Both run on Kambi, but no betslip
  // format has been confirmed for either, so: provider link -> home.
  {
    key: "ballybet",
    name: "Bally Bet",
    tier: 2,
    trafficRank: 15,
    kind: "sportsbook",
    homeUrl: "https://www.ballybet.com",
    allowedHosts: ["ballybet.com"],
    sources: [ODDS_API_BOOKMAKERS, "https://www.ballybet.com/"],
  },
  {
    key: "betparx",
    name: "betPARX",
    tier: 2,
    trafficRank: 16,
    kind: "sportsbook",
    homeUrl: "https://www.betparx.com",
    // No per-state home: on 2026-10-22 nj. and pa.betparx.com answered 301 to
    // /casino, so a state link would put a sports bettor in the casino.
    // www.betparx.com links to each state's site.
    allowedHosts: ["betparx.com"],
    sources: [ODDS_API_BOOKMAKERS, "https://www.betparx.com/"],
  },
  {
    key: "novig",
    name: "Novig",
    tier: 2,
    trafficRank: 21,
    kind: "exchange",
    // The Odds API lists www.novig.us, which redirects to novig.com/landing.
    homeUrl: "https://novig.com/landing",
    allowedHosts: ["novig.com", "novig.us"],
    sources: [ODDS_API_BOOKMAKERS, "https://novig.com/landing"],
  },
  {
    key: "prophetx",
    name: "ProphetX",
    tier: 2,
    trafficRank: 22,
    kind: "exchange",
    homeUrl: "https://www.prophetx.co",
    allowedHosts: ["prophetx.co"],
    sources: [ODDS_API_BOOKMAKERS, "https://www.prophetx.co/"],
  },
  // Sweepstakes / social sportsbooks. Not state-licensed and blocked in many
  // states, so they need legal review and a state gate before launch. Home links only.
  {
    key: "fliff",
    name: "Fliff",
    tier: 2,
    trafficRank: 23,
    kind: "sweepstakes",
    homeUrl: "https://www.getfliff.com",
    allowedHosts: ["getfliff.com"],
    sources: [ODDS_API_BOOKMAKERS, "https://www.getfliff.com/"],
  },
  {
    key: "rebet",
    name: "ReBet",
    tier: 2,
    trafficRank: 25,
    kind: "sweepstakes",
    homeUrl: "https://rebet.app",
    allowedHosts: ["rebet.app"],
    sources: [ODDS_API_BOOKMAKERS, "https://rebet.app/"],
  },
  {
    key: "courtside",
    name: "Courtside",
    tier: 2,
    trafficRank: 26,
    kind: "sweepstakes",
    homeUrl: "https://www.courtside.app",
    allowedHosts: ["courtside.app"],
    sources: [ODDS_API_BOOKMAKERS, "https://www.courtside.app/"],
  },
]

const BY_KEY = new Map(SPORTSBOOKS.map((b) => [b.key, b]))

/** Registry entry for an Odds API key, or null if not registered or excluded. */
export function getSportsbook(key: string | null | undefined): SportsbookEntry | null {
  if (!key) return null
  const k = key.toLowerCase()
  if (EXCLUDED_BOOK_KEYS.has(k)) return null
  return BY_KEY.get(k) ?? null
}

/** Off unless explicitly enabled; see isRoutableBook. */
export function nonSportsbookVenuesEnabled(): boolean {
  return process.env.INCLUDE_NON_SPORTSBOOK_VENUES === "true"
}

/**
 * Whether IntellaBets may send a user to place a bet at this venue.
 *
 * Only registered, licensed sportsbooks by default. Offshore and unregistered
 * keys are never routable -- their prices may still inform the consensus, but
 * we do not point a customer at them. Prediction exchanges and sweepstakes
 * apps are registered (so the panel can label them) but stay off unless
 * INCLUDE_NON_SPORTSBOOK_VENUES=true: several states have banned sweepstakes
 * sportsbooks, prediction markets are contested by state regulators, and the
 * partnership materials commit to licensed sportsbooks only. Turn it on only
 * after a legal review, and add state gating when you do.
 */
export function isRoutableBook(key: string | null | undefined): boolean {
  const entry = getSportsbook(key)
  if (!entry) return false
  return entry.kind === "sportsbook" || nonSportsbookVenuesEnabled()
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** True if `host` equals an allowed host or is a subdomain of one. */
export function hostAllowed(host: string, allowedHosts: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "")
  return allowedHosts.some((a) => {
    const allowed = a.toLowerCase()
    return h === allowed || h.endsWith(`.${allowed}`)
  })
}

/**
 * Returns the normalized URL if it is safe to send a user to for this book,
 * otherwise null.
 */
export function validateBookUrl(raw: unknown, entry: Pick<SportsbookEntry, "allowedHosts">): string | null {
  if (typeof raw !== "string") return null
  if (raw.length === 0 || raw.length > MAX_URL_LENGTH) return null
  // Whitespace and control characters are stripped silently by URL parsing; reject them instead.
  if (/[\s\u0000-\u001f\u007f]/.test(raw)) return null
  // Any placeholder left unfilled (literal or percent-encoded braces) means the link is incomplete.
  if (/[{}]|%7b|%7d/i.test(raw)) return null
  if (!/^https:\/\//i.test(raw)) return null

  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== "https:") return null
  if (u.username || u.password) return null
  if (u.port !== "") return null
  // A fully-qualified trailing dot ("sportsbook.fanduel.com.") reaches the same
  // host but is a different origin: cookies and the user's login do not carry over.
  if (!u.hostname || u.hostname.endsWith(".")) return null
  if (!hostAllowed(u.hostname, entry.allowedHosts)) return null
  return u.href
}

/** The id if it is safe to put into a template, otherwise undefined. */
function cleanId(v: string | null | undefined, pattern: RegExp): string | undefined {
  if (typeof v !== "string") return undefined
  return pattern.test(v) ? v : undefined
}

/**
 * The state slug this book uses in URLs, or null if the state is unknown or
 * not on the book's verified list.
 */
function bookStateSlug(entry: SportsbookEntry, state: string | null | undefined): string | null {
  const st = normalizeState(state)
  if (!st || !entry.states || !entry.states.includes(st)) return null
  return entry.stateSlug ? entry.stateSlug(st) : st
}

/**
 * Fills {state} and the book's other known placeholders in a provider link.
 * Any placeholder left over is caught later by validateBookUrl.
 */
function fillProviderPlaceholders(link: string, entry: SportsbookEntry, stateSlug: string | null): string {
  let out = link
  if (/\{state\}|%7Bstate%7D/i.test(out)) {
    if (!stateSlug) return out // left unfilled -> rejected by validation
    out = out.replace(/\{state\}|%7Bstate%7D/gi, stateSlug)
  }
  for (const [name, value] of Object.entries(entry.placeholderDefaults ?? {})) {
    const re = new RegExp(`\\{${name}\\}|%7B${name}%7D`, "gi")
    out = out.replace(re, value)
  }
  return out
}

/**
 * One query parameter of a provider link, read as text and percent-decoded.
 * Text, not new URL(): links can still hold "{state}", which URL rejects.
 */
function linkParam(link: string | undefined, name: string): string | undefined {
  if (!link) return undefined
  const m = link.match(new RegExp(`[?&]${name}=([^&#]*)`))
  if (!m) return undefined
  try {
    return decodeURIComponent(m[1])
  } catch {
    return undefined
  }
}

/** Every leg's value, or null if any leg lacks one. */
function allOrNull<T>(values: (T | null | undefined)[]): T[] | null {
  return values.every((v) => v !== null && v !== undefined) ? (values as T[]) : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Best safe link for one outcome at one book. Returns null for a book not in
 * the registry, including excluded offshore books.
 */
export function buildBetslipLink(bookKey: string | null | undefined, ctx: DeepLinkContext = {}): DeepLink | null {
  const entry = getSportsbook(bookKey)
  if (!entry) return null

  const stateSlug = bookStateSlug(entry, ctx.state)
  const idPattern = entry.idPattern ?? DEFAULT_ID_PATTERN

  // (a) Provider betslip link.
  if (ctx.providerLink) {
    const url = validateBookUrl(fillProviderPlaceholders(ctx.providerLink, entry, stateSlug), entry)
    if (url) return { url, kind: "betslip", source: "provider" }
  }

  // (b) Betslip built from sids with a sourced template.
  if (entry.betslip) {
    const ids: TemplateIds = {
      outcomeSid: cleanId(ctx.outcomeSid, idPattern),
      marketSid: cleanId(ctx.marketSid, idPattern),
      eventSid: cleanId(ctx.eventSid, idPattern),
      state: entry.states ? stateSlug ?? undefined : undefined,
    }
    const built = entry.betslip.build(ids, encodeURIComponent)
    const url = built ? validateBookUrl(built, entry) : null
    if (url) return { url, kind: "betslip", source: "template" }
  }

  // (c) Event or market page from the provider.
  for (const link of [ctx.marketLink, ctx.eventLink]) {
    if (!link) continue
    const url = validateBookUrl(fillProviderPlaceholders(link, entry, stateSlug), entry)
    if (url) return { url, kind: "event", source: "provider" }
  }

  // (d) Home page, state-specific when we can.
  const home = stateSlug && entry.stateHomeUrl ? entry.stateHomeUrl(stateSlug) : entry.homeUrl
  const url = validateBookUrl(home, entry) ?? validateBookUrl(entry.homeUrl, entry)
  if (url) return { url, kind: "home", source: "fallback" }

  // (e)
  return null
}

/**
 * One link that loads every leg onto a book's betslip, or null.
 *
 * Unlike buildBetslipLink there is no fallback chain: a parlay link either
 * carries every leg or is not offered, and the caller falls back to one link
 * per leg. Null when the book has no sourced multi-selection format, when any
 * leg lacks a valid id, or when there are more legs than the book accepts.
 */
export function buildParlayLink(
  bookKey: string | null | undefined,
  legs: DeepLinkContext[],
  state?: string | null
): DeepLink | null {
  const entry = getSportsbook(bookKey)
  if (!entry?.parlay || legs.length < 2 || legs.length > entry.parlay.maxLegs) return null

  const stateSlug = bookStateSlug(entry, state)
  const idPattern = entry.idPattern ?? DEFAULT_ID_PATTERN
  const ids: ParlayLegIds[] = legs.map((leg) => ({
    outcomeSid: cleanId(leg.outcomeSid, idPattern),
    marketSid: cleanId(leg.marketSid, idPattern),
    eventSid: cleanId(leg.eventSid, idPattern),
    state: entry.states ? stateSlug ?? undefined : undefined,
    providerLink: leg.providerLink ?? undefined,
  }))
  const built = entry.parlay.build(ids, encodeURIComponent)
  const url = built ? validateBookUrl(built, entry) : null
  return url ? { url, kind: "betslip", source: "template" } : null
}
