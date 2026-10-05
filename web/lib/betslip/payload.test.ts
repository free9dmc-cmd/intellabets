import { describe, expect, it } from "vitest"
import { betslipDraftReducer, createInitialDraft } from "./draft"
import { buildBetslipPayload } from "./payload"
import type { BetslipDraft } from "./types"

/** A draft that is valid as-is; tests override one thing at a time. */
function validDraft(overrides: Partial<BetslipDraft> = {}): BetslipDraft {
  const draft = createInitialDraft()
  return {
    ...draft,
    title: "Thursday pack",
    bets: [{ ...draft.bets[0], game: "Chiefs @ Raiders", pick: "Chiefs -4.5", odds: "-110" }],
    ...overrides,
  }
}

function expectError(draft: BetslipDraft, message: string) {
  const result = buildBetslipPayload(draft)
  expect(result).toEqual({ ok: false, error: message })
}

describe("buildBetslipPayload — checks", () => {
  it("accepts a complete betslip", () => {
    expect(buildBetslipPayload(validDraft()).ok).toBe(true)
  })

  it.each([
    { title: "", note: "empty" },
    { title: "   ", note: "whitespace only" },
  ])("requires a title ($note)", ({ title }) => {
    expectError(validDraft({ title }), "Title is required")
  })

  it.each(["game", "pick", "odds"] as const)("requires every bet to have a %s", (field) => {
    const draft = validDraft()
    draft.bets = [draft.bets[0], { ...draft.bets[0], [field]: "" }]
    expectError(draft, "Fill in all bet details (game, pick, odds)")
  })

  it("names the leg whose odds aren't valid American odds", () => {
    const draft = validDraft()
    draft.bets = [draft.bets[0], { ...draft.bets[0], odds: "50" }]
    expectError(draft, "Bet #2: enter American odds like -110 or +150")
  })

  it.each(["abc", "0", "-110abc"])("rejects odds %j instead of silently skipping the leg", (odds) => {
    const draft = validDraft()
    draft.bets = [{ ...draft.bets[0], odds }]
    expectError(draft, "Bet #1: enter American odds like -110 or +150")
  })

  it.each(["", "0", "-5", "abc"])("rejects stake %j instead of silently defaulting the stake", (stake) => {
    expectError(validDraft({ stake }), "Enter a stake greater than 0")
  })

  it("reports problems in a stable order: title, blanks, odds, stake", () => {
    const draft = validDraft({ title: "", stake: "" })
    draft.bets = [{ ...draft.bets[0], odds: "abc" }]
    expectError(draft, "Title is required")
    expectError({ ...draft, title: "T" }, "Bet #1: enter American odds like -110 or +150")
    draft.bets = [{ ...draft.bets[0], odds: "-110" }]
    expectError({ ...draft, title: "T" }, "Enter a stake greater than 0")
  })
})

describe("buildBetslipPayload — the payload", () => {
  function payloadOf(draft: BetslipDraft) {
    const result = buildBetslipPayload(draft)
    if (!result.ok) throw new Error(result.error)
    return result.payload
  }

  it("converts typed text to numbers and keeps the field order the API expects", () => {
    const payload = payloadOf(validDraft({ stake: "25.5" }))
    expect(payload.stake).toBe(25.5)
    expect(payload.bets[0].odds).toBe(-110)
    expect(Object.keys(payload)).toEqual([
      "title",
      "description",
      "sport",
      "league",
      "stake",
      "isPublic",
      "bets",
    ])
  })

  it("reads '+150' and '150' as the same number", () => {
    const draft = validDraft()
    draft.bets = [
      { ...draft.bets[0], odds: "+150" },
      { ...draft.bets[0], odds: "150" },
    ]
    expect(payloadOf(draft).bets.map((bet) => bet.odds)).toEqual([150, 150])
  })

  it("saves every leg with the betslip's sport, even legs created before it was chosen", () => {
    let draft = validDraft() // leg 1 is created while the sport is still the default
    draft = betslipDraftReducer(draft, { type: "setField", field: "sport", value: "NBA" })
    draft = betslipDraftReducer(draft, { type: "addBet" })
    draft.bets = draft.bets.map((bet) => ({ ...bet, game: "G", pick: "P" }))
    expect(draft.bets[0].sport).toBe("NFL") // the draft itself still holds the stale value...

    const payload = payloadOf(draft)

    expect(payload.sport).toBe("NBA")
    expect(payload.bets.map((bet) => bet.sport)).toEqual(["NBA", "NBA"]) // ...the payload does not
  })

  it("keeps the title exactly as typed (the check trims, the payload does not)", () => {
    expect(payloadOf(validDraft({ title: "  Pack  " })).title).toBe("  Pack  ")
  })
})
