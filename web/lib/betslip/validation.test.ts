import { describe, expect, it } from "vitest"
import { validateBetslipDraft } from "./validation"

const completeBet = { game: "Chiefs @ Raiders", pick: "Chiefs -4.5", odds: "-110" }

describe("validateBetslipDraft", () => {
  it("accepts a titled betslip whose bets are complete", () => {
    expect(validateBetslipDraft({ title: "Thursday pack", bets: [completeBet] })).toBeNull()
  })

  it.each([
    { title: "", note: "empty" },
    { title: "   ", note: "whitespace only" },
  ])("requires a title ($note)", ({ title }) => {
    expect(validateBetslipDraft({ title, bets: [completeBet] })).toBe("Title is required")
  })

  it.each(["game", "pick", "odds"] as const)("requires every bet to have a %s", (field) => {
    const incomplete = { ...completeBet, [field]: "" }
    expect(validateBetslipDraft({ title: "T", bets: [completeBet, incomplete] })).toBe(
      "Fill in all bet details (game, pick, odds)"
    )
  })

  it("reports the title problem before the bet problem", () => {
    const incomplete = { ...completeBet, game: "" }
    expect(validateBetslipDraft({ title: "", bets: [incomplete] })).toBe("Title is required")
  })
})
