import { easternDate, matchPlayer, normalizePersonName, personNames, shiftDate, teamMatches } from "./player-names"

// Name objects as the NHL API publishes them (rosterSpots / roster endpoints,
// fetched 2026-11-01), with every locale variant it sent.
const NHL = [
  { id: 8479976, firstName: { default: "Juuso" }, lastName: { default: "Välimäki", de: "Valimaki", es: "Valimaki", fr: "Valimaki" } },
  { id: 8482116, firstName: { default: "Tim" }, lastName: { default: "Stützle" } },
  { id: 8483515, firstName: { default: "Juraj" }, lastName: { default: "Slafkovský" } },
  { id: 8476468, firstName: { default: "J.T." }, lastName: { default: "Miller" } },
  { id: 8482655, firstName: { default: "J.J." }, lastName: { default: "Moser" } },
  { id: 8482109, firstName: { default: "Alexis" }, lastName: { default: "Lafrenière" } },
  { id: 8480426, firstName: { default: "Charle-Edouard" }, lastName: { default: "D'Astous" } },
  { id: 8486025, firstName: { default: "Viggo" }, lastName: { default: "Björck" } },
  { id: 8480817, firstName: { default: "K'Andre" }, lastName: { default: "Miller" } },
  { id: 8480813, firstName: { default: "Joseph", fr: "Joe" }, lastName: { default: "Veleno" } },
  { id: 8476453, firstName: { default: "Nikita" }, lastName: { default: "Kucherov", cs: "Kučerov", fi: "Kutsherov", sk: "Kučerov" } },
]

const players = NHL.map((p) => ({ id: p.id, ...personNames(Object.values(p.firstName), Object.values(p.lastName)) }))

function found(oddsName: string, list = players): number | string {
  const m = matchPlayer(list, oddsName)
  return m.kind === "found" ? m.player.id : m.kind
}

describe("normalizePersonName", () => {
  it.each([
    ["Juuso Välimäki", "juuso valimaki"],
    ["Charle-Edouard D'Astous", "charle edouard dastous"],
    ["K’Andre Miller", "kandre miller"],
    ["J.T. Miller", "jt miller"],
    ["J. T. Miller", "jt miller"],
    ["JT Miller", "jt miller"],
    ["J. J. Moser", "jj moser"],
    ["Wendell Carter Jr.", "wendell carter"],
    ["Jaren Jackson Jr", "jaren jackson"],
    ["Ken Griffey III", "ken griffey"],
    ["  Luca  Del Bel Belluz ", "luca del bel belluz"],
    ["Mikkel Bødker", "mikkel bodker"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePersonName(input)).toBe(expected)
  })

  it("does not join an initial onto a full word", () => {
    expect(normalizePersonName("A. Svechnikov")).toBe("a svechnikov")
  })
})

describe("matchPlayer: the hard cases from the NHL feed", () => {
  it.each([
    ["Juuso Valimaki", 8479976],
    ["Tim Stutzle", 8482116],
    ["Juraj Slafkovsky", 8483515],
    ["JT Miller", 8476468],
    ["J.T. Miller", 8476468],
    ["JJ Moser", 8482655],
    ["J. J. Moser", 8482655],
    ["Alexis Lafreniere", 8482109],
    ["Charle Edouard DAstous", 8480426],
    ["Charle-Edouard D'Astous", 8480426],
    ["Viggo Bjorck", 8486025],
    ["KAndre Miller", 8480817],
    ["K'Andre Miller", 8480817],
    ["Joe Veleno", 8480813],
    ["Nikita Kucerov", 8476453],
  ])("%s is found", (oddsName, id) => {
    expect(found(oddsName)).toBe(id)
  })

  it("finds Joe Veleno by initial and last name when the feed has no fr variant", () => {
    const joseph = { id: 8480813, ...personNames(["Joseph"], ["Veleno"]) }
    expect(found("Joe Veleno", [joseph])).toBe(8480813)
  })

  it("does not grade an undressed player on a teammate who shares the surname and first letter", () => {
    expect(matchPlayer(players, "Jack Miller").kind).toBe("unsure")
  })

  it("tells the two Millers apart by first name, and an initial alone by its letter", () => {
    expect(found("J. Miller")).toBe(8476468)
    expect(found("K. Miller")).toBe(8480817)
  })

  it("is ambiguous when two dressed players share the name", () => {
    // VAN dresses both: #40 (C) and #25 (D).
    const van = [
      { id: 8480012, ...personNames(["Elias"], ["Pettersson"]) },
      { id: 8483678, ...personNames(["Elias"], ["Pettersson"]) },
    ]
    const m = matchPlayer(van, "Elias Pettersson")
    expect(m.kind).toBe("ambiguous")
    expect(m.kind === "ambiguous" && m.candidates.map((p) => p.id)).toEqual([8480012, 8483678])
  })

  it("is ambiguous when only the initial is left and two players share it", () => {
    const two = [
      { id: 1, ...personNames(["Jack"], ["Hughes"]) },
      { id: 2, ...personNames(["Jake"], ["Hughes"]) },
    ]
    expect(found("Jay Hughes", two)).toBe("ambiguous")
  })

  it("is unsure, not absent, when the surname is dressed but the first name differs", () => {
    expect(found("Lukas Stutzle")).toBe("unsure")
    expect(found("Luca Belluz", [{ id: 1, ...personNames(["Luca"], ["Del Bel Belluz"]) }])).toBe("unsure")
  })

  it("is absent when no dressed player has the surname", () => {
    expect(found("Kyle Connor")).toBe("absent")
  })
})

describe("easternDate", () => {
  it("dates a late game by its Eastern day, not its UTC day", () => {
    expect(easternDate(new Date("2026-11-01T02:00:00Z"))).toBe("2026-10-31")
    expect(easternDate(new Date("2026-11-01T18:10:00Z"))).toBe("2026-11-01")
  })

  it("follows daylight saving (EDT until 2026-11-01 06:00Z, EST after)", () => {
    expect(easternDate(new Date("2026-11-01T03:59:00Z"))).toBe("2026-10-31")
    expect(easternDate(new Date("2026-11-01T04:00:00Z"))).toBe("2026-11-01")
    expect(easternDate(new Date("2026-12-01T04:59:00Z"))).toBe("2026-11-30")
    expect(easternDate(new Date("2026-12-01T05:00:00Z"))).toBe("2026-12-01")
  })
})

describe("shiftDate", () => {
  it("crosses month ends", () => {
    expect(shiftDate("2026-10-31", 1)).toBe("2026-11-01")
    expect(shiftDate("2027-03-01", -1)).toBe("2027-02-28")
  })
})

describe("teamMatches", () => {
  it.each([
    ["St. Louis Blues", "Blues"],
    ["St Louis Blues", "Blues"],
    ["Montréal Canadiens", "Canadiens"],
    ["Montreal Canadiens", "Canadiens"],
    ["Vegas Golden Knights", "Golden Knights"],
    ["Utah Mammoth", "Mammoth"],
    ["Columbus Blue Jackets", "Blue Jackets"],
  ])("%s is the %s", (oddsName, nickname) => {
    expect(teamMatches(oddsName, nickname)).toBe(true)
  })

  it.each([
    ["New York Rangers", "Islanders"],
    ["Detroit Red Wings", "Wild"],
    ["Ottawa Senators", "Sénateurs"],
    ["Carolina Hurricanes", ""],
  ])("%s is not the %s", (oddsName, nickname) => {
    expect(teamMatches(oddsName, nickname)).toBe(false)
  })
})
