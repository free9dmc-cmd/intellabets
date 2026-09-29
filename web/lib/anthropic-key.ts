/**
 * Reads ANTHROPIC_API_KEY defensively.
 *
 * Production returned `401 {"type":"authentication_error","message":"API key is
 * invalid."}` across several key rotations. The key was set each time; it was
 * the value that was wrong. The overwhelmingly common cause is invisible:
 * copying a key out of a console picks up a trailing newline or a leading
 * space, the dashboard stores it verbatim, and the SDK sends it verbatim.
 * Nothing in the UI shows it and the error says only "invalid".
 *
 * So: trim, and check the shape before spending a network round trip on it.
 * A malformed key now reports as unconfigured -- an honest "unavailable"
 * message -- instead of surfacing to the customer as "something went wrong".
 */

/** The key with surrounding whitespace removed, or null when unusable. */
export function anthropicKey(): string | null {
  const raw = process.env.ANTHROPIC_API_KEY
  if (!raw) return null
  const key = raw.trim()
  return key.length > 0 ? key : null
}

/**
 * Whether the key is even shaped like an Anthropic key.
 *
 * Catches the other half of the paste problem: a truncated key, a key id
 * rather than the key itself, or an unrelated value in the wrong variable.
 * Deliberately a prefix-and-length check rather than anything stricter --
 * key formats change, and being wrong here would disable a working key.
 */
export function isAnthropicKeyWellFormed(key: string | null): key is string {
  return Boolean(key && key.startsWith("sk-ant-") && key.length > 40)
}

/** Why the key is unusable, for the admin health check. Null when it is fine. */
export function anthropicKeyProblem(): string | null {
  const raw = process.env.ANTHROPIC_API_KEY
  if (!raw) return "ANTHROPIC_API_KEY is not set"
  if (raw.trim().length === 0) return "ANTHROPIC_API_KEY is only whitespace"
  if (raw !== raw.trim()) {
    return "ANTHROPIC_API_KEY has leading or trailing whitespace (it is trimmed before use, but re-paste it without the stray characters)"
  }
  const key = raw.trim()
  if (!key.startsWith("sk-ant-")) {
    return `ANTHROPIC_API_KEY does not start with "sk-ant-" - this looks like the wrong value, not a key`
  }
  if (key.length <= 40) return "ANTHROPIC_API_KEY looks truncated"
  return null
}
