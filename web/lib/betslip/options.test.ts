import { describe, expect, it } from "vitest"
import { SPORTS } from "@/lib/utils"
import { BET_TYPES, createInitialDraft } from "./draft"
import { BET_TYPE_OPTIONS, SPORT_OPTIONS } from "./options"

describe("SPORT_OPTIONS", () => {
  it("stores the plain sport name, never the decorated label", () => {
    expect(SPORT_OPTIONS.map((o) => o.value)).toEqual(SPORTS)
    // Plain letters only: no emoji or spaces can leak into saved data.
    for (const { value } of SPORT_OPTIONS) expect(value).toMatch(/^[A-Za-z]+$/)
  })

  it("still shows the emoji next to the name", () => {
    const nfl = SPORT_OPTIONS.find((o) => o.value === "NFL")
    expect(nfl?.label).toBe("🏈 NFL")
  })

  it("includes the sport a new form starts with, so the dropdown opens on it", () => {
    expect(SPORT_OPTIONS.map((o) => o.value)).toContain(createInitialDraft().sport)
  })
})

describe("BET_TYPE_OPTIONS", () => {
  it("offers exactly the bet types the form knows about", () => {
    expect(BET_TYPE_OPTIONS.map((o) => o.value)).toEqual([...BET_TYPES])
  })

  it("includes the bet type a new leg starts with", () => {
    expect(BET_TYPE_OPTIONS.map((o) => o.value)).toContain(createInitialDraft().bets[0].betType)
  })
})
