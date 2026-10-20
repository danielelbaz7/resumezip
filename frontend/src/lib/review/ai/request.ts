// What the review page and the editor send /api/review: the printed lines,
// numbered, and nothing else (no file, no name of it). Checked by the server
// as it's read, since anyone can send anything there.

import type { Unit } from "./units"

export type SentLine = Pick<Unit, "id" | "text" | "bullet">

// A long two-page resume is about 120 lines and 8,000 characters.
export const MOST_LINES = 300
export const MOST_LINE_CHARS = 1_000
export const MOST_CHARS = 24_000

export const sentOf = (units: readonly Unit[]): SentLine[] => units.map(({ id, text, bullet }) => ({ id, text, bullet }))

/** The lines in a request's body, or null if it isn't lines the page would send. */
export function linesOf(body: unknown): SentLine[] | null {
  const lines = body && typeof body === "object" && "lines" in body && Array.isArray(body.lines) ? (body.lines as unknown[]) : null
  if (!lines || lines.length === 0 || lines.length > MOST_LINES) return null
  let chars = 0
  const sent: SentLine[] = []
  for (const line of lines) {
    if (!line || typeof line !== "object") return null
    const { id, text, bullet } = line as Record<string, unknown>
    if (typeof id !== "string" || !/^u\d{1,4}$/.test(id)) return null
    if (typeof text !== "string" || text.length > MOST_LINE_CHARS || typeof bullet !== "boolean") return null
    chars += text.length
    if (chars > MOST_CHARS) return null
    sent.push({ id, text, bullet })
  }
  return sent
}
