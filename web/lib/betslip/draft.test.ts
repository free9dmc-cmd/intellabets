import { describe, expect, it } from "vitest"
import {
  betslipDraftReducer,
  createEmptyBet,
  createInitialDraft,
  toBetslipPayload,
} from "./draft"

describe("createInitialDraft", () => {
  it("starts with empty details and exactly one blank leg", () => {
    const draft = createInitialDraft()
    expect(draft.title).toBe("")
    expect(draft.isPublic).toBe(false)
    expect(draft.bets).toEqual([createEmptyBet()])
  })

  it("returns fresh objects each call, so forms never share state", () => {
    expect(createInitialDraft().bets).not.toBe(createInitialDraft().bets)
  })
})

describe("betslipDraftReducer", () => {
  it("setField changes one field and leaves the rest alone", () => {
    const before = createInitialDraft()
    const after = betslipDraftReducer(before, { type: "setField", field: "title", value: "Pack" })
    expect(after.title).toBe("Pack")
    expect(after.bets).toBe(before.bets)
  })

  it("setField handles non-string fields", () => {
    const after = betslipDraftReducer(createInitialDraft(), {
      type: "setField",
      field: "isPublic",
      value: true,
    })
    expect(after.isPublic).toBe(true)
  })

  it("addBet appends a blank leg that inherits the betslip's current sport", () => {
    let draft = createInitialDraft()
    draft = betslipDraftReducer(draft, { type: "setField", field: "sport", value: "NBA" })
    draft = betslipDraftReducer(draft, { type: "addBet" })
    expect(draft.bets).toHaveLength(2)
    expect(draft.bets[1]).toEqual(createEmptyBet("NBA"))
  })

  it("removeBet drops only the leg at that index", () => {
    let draft = createInitialDraft()
    draft = betslipDraftReducer(draft, { type: "addBet" })
    draft = betslipDraftReducer(draft, { type: "updateBet", index: 1, field: "pick", value: "B" })
    draft = betslipDraftReducer(draft, { type: "removeBet", index: 0 })
    expect(draft.bets).toHaveLength(1)
    expect(draft.bets[0].pick).toBe("B")
  })

  it("updateBet changes one field of one leg", () => {
    const draft = betslipDraftReducer(createInitialDraft(), {
      type: "updateBet",
      index: 0,
      field: "odds",
      value: "+200",
    })
    expect(draft.bets[0].odds).toBe("+200")
    expect(draft.bets[0].betType).toBe(createEmptyBet().betType)
  })

  it("never mutates the previous state", () => {
    const before = createInitialDraft()
    const snapshot = structuredClone(before)
    betslipDraftReducer(before, { type: "updateBet", index: 0, field: "game", value: "X" })
    betslipDraftReducer(before, { type: "addBet" })
    betslipDraftReducer(before, { type: "setField", field: "league", value: "Y" })
    expect(before).toEqual(snapshot)
  })

  it("keeps untouched legs as the same object, so memoized rows can skip re-rendering", () => {
    let before = createInitialDraft()
    before = betslipDraftReducer(before, { type: "addBet" })
    const after = betslipDraftReducer(before, {
      type: "updateBet",
      index: 1,
      field: "game",
      value: "X",
    })
    expect(after.bets[0]).toBe(before.bets[0])
    expect(after.bets[1]).not.toBe(before.bets[1])
  })
})

describe("toBetslipPayload", () => {
  it("converts typed text to numbers and keeps the field set the API expects", () => {
    let draft = createInitialDraft()
    draft = betslipDraftReducer(draft, { type: "setField", field: "title", value: "Pack" })
    draft = betslipDraftReducer(draft, { type: "setField", field: "stake", value: "25.5" })
    draft = betslipDraftReducer(draft, { type: "updateBet", index: 0, field: "odds", value: "+150" })

    const payload = toBetslipPayload(draft)

    expect(payload.stake).toBe(25.5)
    expect(payload.bets[0].odds).toBe(150)
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

  it("keeps the title exactly as typed (validation trims, the payload does not)", () => {
    const draft = betslipDraftReducer(createInitialDraft(), {
      type: "setField",
      field: "title",
      value: "  Pack  ",
    })
    expect(toBetslipPayload(draft).title).toBe("  Pack  ")
  })
})
