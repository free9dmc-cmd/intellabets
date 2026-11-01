#!/usr/bin/env node
/**
 * A stand-in for The Odds API v4, for the local player-props E2E: no real key,
 * no credits spent. It serves the props fixtures in
 * src/modules/ingestion/__fixtures__ (one real event each for NBA, NFL and
 * NHL, american odds):
 *
 *   GET /v4/sports/{key}/events              the fixture's event, starting
 *                                            FAKE_ODDS_START_MIN (90) minutes
 *                                            from the time of the request, which
 *                                            is inside the props late window
 *   GET /v4/sports/{key}/events/{id}/odds    the fixture's props, limited to
 *                                            ?markets=, same start time
 *   GET /v4/sports/{key}/odds                []
 *   GET /v4/sports/{key}/scores              []
 *
 * Every response carries x-requests-last (markets returned x regions, which
 * is what The Odds API charges; 0 for listings and empty answers) and
 * x-requests-remaining / x-requests-used from a running counter. Links and
 * sids are always included. A request without apiKey gets a 401, an unknown
 * event a 404, as from the real API.
 *
 * In the sandbox, the backend directory is mounted at /app in the api
 * container, so run it there and point the engine at it:
 *
 *   docker compose -f docker-compose.base44.yml exec -d api node test/e2e/fake-odds-api.mjs
 *   ODDS_API_BASE_URL=http://127.0.0.1:4010/v4   (ignored when NODE_ENV=production)
 *
 * Env: FAKE_ODDS_PORT (4010), FAKE_ODDS_HOST (127.0.0.1),
 * FAKE_ODDS_START_MIN (90), FAKE_ODDS_REMAINING (19000).
 */
import { createServer } from "node:http"
import { readFileSync } from "node:fs"

const PORT = Number(process.env.FAKE_ODDS_PORT || 4010)
const HOST = process.env.FAKE_ODDS_HOST || "127.0.0.1"
const START_MIN = Number(process.env.FAKE_ODDS_START_MIN || 90)

const FIXTURES = new URL("../../src/modules/ingestion/__fixtures__/", import.meta.url)
const FILES = {
  basketball_nba: "props-nba.json",
  americanfootball_nfl: "props-nfl.json",
  icehockey_nhl: "props-nhl.json",
}
const games = Object.fromEntries(
  Object.entries(FILES).map(([key, file]) => [key, JSON.parse(readFileSync(new URL(file, FIXTURES), "utf8"))])
)

let remaining = Number(process.env.FAKE_ODDS_REMAINING || 19000)
let used = 0

/** The start time every event gets, as The Odds API writes it. */
function commenceTime() {
  return new Date(Date.now() + START_MIN * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z")
}

function eventOf(game) {
  const { id, sport_key, sport_title, home_team, away_team } = game
  return { id, sport_key, sport_title, commence_time: commenceTime(), home_team, away_team }
}

function toDecimal(american) {
  return Number((american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american)).toFixed(4))
}

/** The fixture's props limited to the requested markets, and what that call costs. */
function eventOdds(game, params) {
  const wanted = params.get("markets") ? new Set(params.get("markets").split(",").map((m) => m.trim())) : null
  const regions = (params.get("regions") || "us").split(",").filter(Boolean).length || 1
  const decimal = params.get("oddsFormat") === "decimal"
  const marketKeys = new Set()
  const bookmakers = []
  for (const bm of game.bookmakers) {
    const markets = bm.markets
      .filter((m) => !wanted || wanted.has(m.key))
      .map((m) => ({
        ...m,
        outcomes: m.outcomes.map((o) => (decimal ? { ...o, price: toDecimal(o.price) } : o)),
      }))
    for (const m of markets) marketKeys.add(m.key)
    if (markets.length) bookmakers.push({ ...bm, markets })
  }
  return { body: { ...eventOf(game), bookmakers }, cost: marketKeys.size * regions }
}

function send(res, status, body, cost = 0) {
  remaining = Math.max(0, remaining - cost)
  used += cost
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "x-requests-last": String(cost),
    "x-requests-remaining": String(remaining),
    "x-requests-used": String(used),
  })
  res.end(JSON.stringify(body))
  return cost
}

function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`)
  if (req.method !== "GET") return send(res, 405, { message: "Method not allowed" })
  if (!url.searchParams.get("apiKey")) {
    return send(res, 401, { message: "API key is missing.", error_code: "MISSING_KEY" })
  }

  let m = /^\/v4\/sports\/([a-z0-9_]+)\/events\/?$/.exec(url.pathname)
  if (m) {
    const game = games[m[1]]
    return send(res, 200, game ? [eventOf(game)] : [])
  }

  m = /^\/v4\/sports\/([a-z0-9_]+)\/events\/([^/]+)\/odds\/?$/.exec(url.pathname)
  if (m) {
    const game = games[m[1]]
    if (!game || game.id !== m[2]) {
      return send(res, 404, { message: `Event not found. The event may have expired.`, error_code: "EVENT_NOT_FOUND" })
    }
    const { body, cost } = eventOdds(game, url.searchParams)
    return send(res, 200, body, cost)
  }

  if (/^\/v4\/sports\/[a-z0-9_]+\/(odds|scores)\/?$/.test(url.pathname)) return send(res, 200, [])

  return send(res, 404, { message: `Unknown path ${url.pathname}`, error_code: "UNKNOWN_PATH" })
}

const server = createServer((req, res) => {
  let cost = 0
  try {
    cost = route(req, res)
  } catch (err) {
    send(res, 500, { message: String(err && err.message ? err.message : err) })
  }
  const path = (req.url || "").replace(/apiKey=[^&]*/, "apiKey=***")
  console.log(`${new Date().toISOString()} ${req.method} ${path} -> ${res.statusCode} (cost ${cost}, remaining ${remaining})`)
})

server.listen(PORT, HOST, () => {
  console.log(
    `Fake Odds API on http://${HOST}:${PORT}/v4 serving ${Object.keys(games).join(", ")}; ` +
      `events start ${START_MIN} min after each request`
  )
})

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)))
