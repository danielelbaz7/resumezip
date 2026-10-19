// The model's answer, checked before anything is drawn. It's untrusted text
// from another service: a note whose line doesn't exist, or whose quote isn't
// on that line, is looked for by its quote, and listed under the page if it
// can't be placed, never marked somewhere it isn't about.

import { comparable } from "@/lib/check/pdf"
import { MOST_GREEN, MOST_RED } from "./prompt"
import type { Unit } from "./units"

export type Tone = "red" | "green"

export interface AiNote {
  tone: Tone
  title: string
  why: string
  suggestion: string | null
  /** The line it's about; null when it couldn't be placed. */
  unit: Unit | null
  /** The words it's about, as printed on that line; null to mark the whole line. */
  quote: string | null
}

// Longer than any note a recruiter would write; past this it's the model rambling.
const MOST_CHARS = 600

const text = (value: unknown, most = MOST_CHARS): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, most) : null

// A quote shorter than this would be found on lines it isn't about.
const LEAST_QUOTE = 4

/** The notes in `answer` that can be shown, at most MOST_RED red and MOST_GREEN green. */
export function notesOf(answer: unknown, units: readonly Unit[]): AiNote[] {
  const raw = answer && typeof answer === "object" && "notes" in answer && Array.isArray(answer.notes) ? answer.notes : []
  const byId = new Map(units.map((unit) => [unit.id, unit]))
  const counts: Record<Tone, number> = { red: 0, green: 0 }
  const taken = new Set<string>()
  const notes: AiNote[] = []
  for (const each of raw as unknown[]) {
    if (!each || typeof each !== "object") continue
    const item = each as Record<string, unknown>
    const tone = item.tone === "red" || item.tone === "green" ? item.tone : null
    const title = text(item.title, 120)
    const why = text(item.why)
    if (!tone || !title || !why) continue
    if (counts[tone] >= (tone === "red" ? MOST_RED : MOST_GREEN)) continue
    // Some answers copy the bullet's mark into the quote, and the line's text has none.
    const quote = text(typeof item.quote === "string" ? item.quote.replace(/^[\s•▪◦‣·*-]+/u, "") : null)
    const wanted = quote && comparable(quote).length >= LEAST_QUOTE ? comparable(quote) : null
    const id = typeof item.line === "string" ? item.line.replace(/[[\]\s]/g, "") : ""
    const named = byId.get(id)
    const unit =
      named && (!wanted || comparable(named.text).includes(wanted))
        ? named
        : wanted
          ? (units.find((each) => comparable(each.text).includes(wanted)) ?? named ?? null)
          : (named ?? null)
    const quoted = unit && wanted && comparable(unit.text).includes(wanted) ? quote : null
    // One note of each kind per line: the model sometimes splits one point in two.
    if (unit && taken.has(`${tone}|${unit.id}`)) continue
    if (unit) taken.add(`${tone}|${unit.id}`)
    counts[tone]++
    notes.push({ tone, title, why, suggestion: tone === "red" ? text(item.suggestion) : null, unit, quote: quoted })
  }
  return notes
}
