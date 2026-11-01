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
  /** Exactly one player has this name, or a unique first initial and last name. */
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

  // "Joe Veleno" for a Joseph with no "Joe" variant: same last name and the
  // same start of the first name. A full first name must share two letters:
  // a "Jack Miller" who did not dress must not be graded on a dressed
  // "J.T. Miller". A feed name that is itself an initial ("J. Miller") can
  // only be matched on that letter.
  const first = name.split(" ")[0]
  const firstStart = first.length === 1 ? first : first.slice(0, 2)
  const byInitial = players.filter(
    (p) => p.lastNames.some((l) => name.endsWith(" " + l)) && p.firstNames.some((f) => f.startsWith(firstStart))
  )
  if (byInitial.length === 1) return { kind: "found", player: byInitial[0] }
  if (byInitial.length > 1) return { kind: "ambiguous", candidates: byInitial }

  // Loose on purpose: anything close to a dressed player's surname leaves the
  // prop pending rather than voiding it as "did not play".
  const lastToken = name.split(" ").pop() ?? name
  const nearSurname = (l: string) => l.split(" ").pop() === lastToken || compact(name).endsWith(compact(l))
  if (players.some((p) => p.lastNames.some(nearSurname))) return { kind: "unsure" }
  return { kind: "absent" }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((v) => v !== ""))]
}
