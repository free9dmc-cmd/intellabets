import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios"
import type { ConfigService } from "@nestjs/config"
import { OddsAggregatorService, OddsApiError } from "./odds-aggregator.service"

function service(adapter: (config: InternalAxiosRequestConfig) => Promise<unknown>) {
  const config = { get: (_k: string, d?: unknown) => (_k === "THE_ODDS_API_KEY" ? "test-key-0123456789" : d) }
  const svc = new OddsAggregatorService(config as unknown as ConfigService)
  ;(svc as unknown as { http: { defaults: { adapter: unknown } } }).http.defaults.adapter = adapter
  return svc
}

describe("OddsAggregatorService errors", () => {
  it("reports The Odds API's error code and the credits left, not just the status", async () => {
    const svc = service(async (config) => {
      const response = {
        status: 401,
        statusText: "Unauthorized",
        data: { message: "Usage quota has been reached.", error_code: "OUT_OF_USAGE_CREDITS" },
        headers: new AxiosHeaders({ "x-requests-remaining": "0", "x-requests-used": "20000" }),
        config,
      }
      throw new AxiosError("Request failed with status code 401", "ERR_BAD_REQUEST", config, null, response)
    })

    const err = await svc.fetchSlate("americanfootball_nfl").catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OddsApiError)
    expect((err as OddsApiError).status).toBe(401)
    expect((err as OddsApiError).code).toBe("OUT_OF_USAGE_CREDITS")
    expect((err as OddsApiError).isAuthFailure).toBe(true)
    expect((err as Error).message).toContain("Usage quota has been reached.")
    // The API key is sent as a query param; it must never appear in the error.
    expect((err as Error).message).not.toContain("test-key-0123456789")

    const status = svc.status()
    expect(status.lastError).toMatchObject({ status: 401, code: "OUT_OF_USAGE_CREDITS" })
    expect(status.quota).toMatchObject({ remaining: 0, used: 20000 })
    expect(status.lastSuccessAt).toBeNull()
  })

  it("records the quota on success", async () => {
    const svc = service(async (config) => ({
      status: 200,
      statusText: "OK",
      data: [],
      headers: new AxiosHeaders({ "x-requests-remaining": "19500", "x-requests-used": "500", "x-requests-last": "3" }),
      config,
    }))
    await expect(svc.fetchSlate("americanfootball_nfl")).resolves.toEqual([])
    expect(svc.status().quota).toMatchObject({ remaining: 19500, used: 500, lastCost: 3 })
    expect(svc.status().lastSuccessAt).not.toBeNull()
  })

  it("does not treat a server error as an auth failure", async () => {
    const svc = service(async (config) => {
      const response = { status: 500, statusText: "Error", data: {}, headers: new AxiosHeaders(), config }
      throw new AxiosError("Request failed with status code 500", "ERR_BAD_RESPONSE", config, null, response)
    })
    const err = (await svc.fetchSlate("basketball_nba").catch((e: unknown) => e)) as OddsApiError
    expect(err.isAuthFailure).toBe(false)
  })
})

describe("OddsAggregatorService outcome descriptions", () => {
  it("signs a spread but not a total", async () => {
    const market = (key: string, outcomes: { name: string; price: number; point: number }[]) => ({
      key,
      last_update: "2026-10-28T12:00:00Z",
      outcomes,
    })
    const svc = service(async (config) => ({
      status: 200,
      statusText: "OK",
      data: [
        {
          id: "evt",
          sport_key: "americanfootball_nfl",
          commence_time: "2026-10-29T17:00:00Z",
          home_team: "Kansas City Chiefs",
          away_team: "Las Vegas Raiders",
          bookmakers: [
            {
              key: "fanduel",
              title: "FanDuel",
              markets: [
                market("spreads", [
                  { name: "Kansas City Chiefs", price: -110, point: -6.5 },
                  { name: "Las Vegas Raiders", price: -110, point: 6.5 },
                ]),
                market("totals", [
                  { name: "Over", price: -110, point: 45.5 },
                  { name: "Under", price: -110, point: 45.5 },
                ]),
              ],
            },
          ],
        },
      ],
      headers: new AxiosHeaders(),
      config,
    }))
    const [game] = await svc.fetchSlate("americanfootball_nfl")
    const describe = (type: string) => game.booksByMarket.get(type)![0].line.outcomes.map((o) => o.description)
    expect(describe("spread")).toEqual(["Kansas City Chiefs -6.5", "Las Vegas Raiders +6.5"])
    expect(describe("total")).toEqual(["Over 45.5", "Under 45.5"])
  })
})
