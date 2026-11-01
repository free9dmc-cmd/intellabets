/**
 * Name helpers for grading player props against a league's own box scores.
 *
 * The Odds API writes plain names ("Juuso Valimaki", "JT Miller", "KAndre
 * Miller"); league feeds write them with accents, periods and apostrophes
 * ("Välimäki", "J.T.", "K'Andre"). Both sides go through normalizePersonName
 * before they are compared, and a prop is only graded on an unambiguous match.
 */

/** Generational suffixes, dropped wherever they appear ("Jr.", "III"). */
const SUFFIXES: ReadonlySet<string> = new Set(["jr", "sr", "ii", "iii", "iv"])

/** Letters NFKD does not decompose, folded to how English feeds spell them. */
const FOLDS: Record<string, string> = { ø: "o", æ: "ae", œ: "oe", ß: "ss", ł: "l", đ: "d", ð: "d", þ: "th", ı: "i" }

/**
 * Comparable form of a person's name: NFKD, accents stripped, lowercase,
 * apostrophes and periods dropped, any other punctuation turned into a space,
 * suffixes dropped and consecutive single-letter initials joined, so
 * "J. T. Miller", "J.T. Miller" and "JT Miller" all read "jt miller".
 */
export function normalizePersonName(name: string): string {
  const plain = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[øæœßłđðþı]/g, (c) => FOLDS[c] ?? c)
    .replace(/['’‘ʼ.]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")

  const out: string[] = []
  let joining = false // the last token in `out` is built from single-letter initials
  for (const token of plain.split(" ")) {
    if (token === "" || SUFFIXES.has(token)) continue
    const initial = /^\p{L}$/u.test(token)
    if (initial && joining) out[out.length - 1] += token
    else out.push(token)
    joining = initial
  }
  return out.join(" ")
}

/** A name with no spaces, for comparing multi-word surnames loosely. */
function compact(name: string): string {
  return name.replace(/ /g, "")
}

/**
 * The calendar date (YYYY-MM-DD) of an instant in US Eastern time, which is
 * how the NHL dates its games: a 10 pm ET start is 02:00Z the next day, and a
 * UTC date would look on the wrong day's slate.
 */
export function easternDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

/** A YYYY-MM-DD date moved by whole days. */
export function shiftDate(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Whether a full team name from the odds feed ("St. Louis Blues", "Montréal
 * Canadiens") is the team a league feed calls by its nickname ("Blues").
 */
export function teamMatches(oddsName: string, nickname: string): boolean {
  const full = normalizePersonName(oddsName)
  const nick = normalizePersonName(nickname)
  if (!full || !nick) return false
  return full === nick || full.endsWith(" " + nick)
}

/** Every normalized spelling of one player's name, across a feed's locales. */
export interface PersonNames {
  /** "first last" for every first-name variant times every last-name variant. */
  fullNames: string[]
  firstNames: string[]
  lastNames: string[]
}

/**
 * Index a player's name variants. Feeds give localized spellings next to the
 * default ({ default: "Joseph", fr: "Joe" }, { default: "Kucherov", cs:
 * "Kučerov" }); any of them may be the one the odds feed used.
 */
export function personNames(firstVariants: string[], lastVariants: string[]): PersonNames {
  const firstNames = unique(firstVariants.map(normalizePersonName))
  const lastNames = unique(lastVariants.map(normalizePersonName))
  const fullNames = unique(firstNames.flatMap((f) => lastNames.map((l) => normalizePersonName(`${f} ${l}`))))
  return { fullNames, firstNames, lastNames }
}

export type PlayerMatch<T> =
  /** Exactly one player has this name, or the same surname and the same first name (see sameFirstName). */
  | { kind: "found"; player: T }
  /** More than one dressed player has this name; never guess between them. */
  | { kind: "ambiguous"; candidates: T[] }
  /** No match, but a dressed player has this last name: a spelling we cannot settle. */
  | { kind: "unsure" }
  /** Nobody dressed has this last name: the player did not play. */
  | { kind: "absent" }

/**
 * Find the player an odds-feed name refers to among a game's dressed players.
 * Only "absent" justifies voiding a prop; "ambiguous" and "unsure" mean the
 * name cannot be settled automatically.
 */
export function matchPlayer<T extends PersonNames>(players: T[], oddsName: string): PlayerMatch<T> {
  const name = normalizePersonName(oddsName)
  if (!name) return { kind: "unsure" }

  const byFullName = players.filter((p) => p.fullNames.includes(name))
  if (byFullName.length === 1) return { kind: "found", player: byFullName[0] }
  if (byFullName.length > 1) return { kind: "ambiguous", candidates: byFullName }

  const byFirstName = players.filter((p) => sameSurnameAndFirstName(p, name))
  if (byFirstName.length === 1) return { kind: "found", player: byFirstName[0] }
  if (byFirstName.length > 1) return { kind: "ambiguous", candidates: byFirstName }

  return nearSurname(players, name) ? { kind: "unsure" } : { kind: "absent" }
}

export type GameMatch<T, R> =
  /** One player of either club has this name, and he dressed. */
  | { kind: "found"; player: T }
  /** More than one player of the two clubs has this name: never guess. */
  | { kind: "ambiguous"; candidates: (T | R)[] }
  | { kind: "unsure" }
  /** He is on a club's roster but did not dress, or is on neither club. */
  | { kind: "absent" }

/**
 * matchPlayer for a game, checked against both clubs' full rosters as well as
 * the players who dressed. A name shared by two players of the clubs (VAN has
 * two Elias Petterssons) is ambiguous even when only one of them dressed, and
 * a rostered player who did not dress is absent, never graded on a dressed
 * teammate with a similar name.
 */
export function matchInGame<T extends PersonNames & { playerId: number }, R extends PersonNames & { playerId: number }>(
  dressed: T[],
  rostered: R[],
  oddsName: string
): GameMatch<T, R> {
  const name = normalizePersonName(oddsName)
  if (!name) return { kind: "unsure" }
  const everyone = new Map<number, T | R>()
  for (const p of rostered) everyone.set(p.playerId, p)
  for (const p of dressed) everyone.set(p.playerId, p)
  const all = Array.from(everyone.values())
  const dressedById = new Map(dressed.map((p) => [p.playerId, p]))

  const pick = (candidates: (T | R)[]): GameMatch<T, R> | null => {
    if (candidates.length > 1) return { kind: "ambiguous", candidates }
    if (candidates.length === 0) return null
    const player = dressedById.get(candidates[0].playerId)
    return player ? { kind: "found", player } : { kind: "absent" }
  }

  return (
    pick(all.filter((p) => p.fullNames.includes(name))) ??
    pick(all.filter((p) => sameSurnameAndFirstName(p, name))) ??
    (nearSurname(all, name) ? { kind: "unsure" } : { kind: "absent" })
  )
}

/**
 * Nicknames that are not a prefix of the full first name ("Joe" for
 * "Joseph"); prefixes of 3 letters or more ("Mitch", "Alex") match anyway.
 */
const NICKNAMES: readonly (readonly [string, string])[] = [
  ["joe", "joseph"], ["joey", "joseph"], ["jake", "jacob"], ["tom", "thomas"], ["tommy", "thomas"],
  ["tony", "anthony"], ["bill", "william"], ["billy", "william"], ["bob", "robert"], ["bobby", "robert"],
  ["jim", "james"], ["jimmy", "james"], ["mike", "michael"], ["mikey", "michael"], ["nate", "nathan"],
  ["nate", "nathaniel"], ["andy", "andrew"], ["drew", "andrew"], ["danny", "daniel"], ["matty", "matthew"],
  ["freddie", "frederick"], ["eddie", "edward"], ["ted", "edward"], ["teddy", "theodore"], ["chuck", "charles"],
  ["charlie", "charles"], ["dave", "david"], ["davey", "david"], ["steve", "stephen"], ["rick", "richard"],
  ["ricky", "richard"], ["dick", "richard"], ["kenny", "kenneth"], ["sasha", "alexander"], ["jack", "john"],
]

/**
 * Same surname, and a first name that is the same person's: equal, a prefix
 * of at least 3 letters, a known nickname, or the feed's lone initial ("J.
 * Miller"). "Anders" and "Andre" are different people.
 */
function sameSurnameAndFirstName(p: PersonNames, name: string): boolean {
  const surname = p.lastNames.find((l) => name.endsWith(" " + l))
  if (!surname) return false
  const first = name.slice(0, name.length - surname.length - 1).split(" ")[0]
  return p.firstNames.some((f) => sameFirstName(first, f.split(" ")[0]))
}

function sameFirstName(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (a.length === 1) return b.startsWith(a)
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (short.length >= 3 && long.startsWith(short)) return true
  return NICKNAMES.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
}

/** Loose on purpose: anything close to a surname leaves the prop pending rather than voiding it. */
function nearSurname(players: PersonNames[], name: string): boolean {
  const lastToken = name.split(" ").pop() ?? name
  const near = (l: string) => l.split(" ").pop() === lastToken || compact(name).endsWith(compact(l))
  return players.some((p) => p.lastNames.some(near))
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((v) => v !== ""))]
}
