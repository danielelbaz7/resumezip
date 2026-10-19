// The model's answer, checked before anything is drawn. It's untrusted text
// from another service: a note whose line doesn't exist, or whose quote isn't
// on that line, is looked for by its quote, and listed under the page if it
// can't be placed, never marked somewhere it isn't about.

import { comparable, wordsOf } from "@/lib/check/pdf"
import { MOST_GREEN, MOST_RED } from "./prompt"
import type { SavedNote } from "./saved"
import type { Unit } from "./units"

export type Tone = "red" | "green"

export interface AiNote {
  /** Its place in what the AI sent, which tells it apart wherever it's shown. */
  index: number
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

// Whether a quote that isn't on its line is that line reworded: most of its
// longer words are there. Short ones ("a", "for", "the") are on every line.
function reworded(quote: string, text: string): boolean {
  const there = new Set(wordsOf(text))
  const words = wordsOf(quote).filter((word) => word.length > 3)
  return words.length > 0 && words.filter((word) => there.has(word)).length * 2 >= words.length
}

/** The notes in `answer` that can be shown, at most MOST_RED red and MOST_GREEN green. */
export function notesOf(answer: unknown, units: readonly Unit[]): AiNote[] {
  const raw = answer && typeof answer === "object" && "notes" in answer && Array.isArray(answer.notes) ? answer.notes : []
  const byId = new Map(units.map((unit) => [unit.id, unit]))
  const counts: Record<Tone, number> = { red: 0, green: 0 }
  const taken = new Set<string>()
  const notes: AiNote[] = []
  for (const [index, each] of (raw as unknown[]).entries()) {
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
    // A quote that's on no line marks the whole line it names, if it's that line reworded.
    const unit =
      named && (!wanted || comparable(named.text).includes(wanted))
        ? named
        : wanted
          ? (units.find((each) => comparable(each.text).includes(wanted)) ?? (named && quote && reworded(quote, named.text) ? named : null))
          : (named ?? null)
    const quoted = unit && wanted && comparable(unit.text).includes(wanted) ? quote : null
    // One note of each kind per line: the model sometimes splits one point in two.
    if (unit && taken.has(`${tone}|${unit.id}`)) continue
    if (unit) taken.add(`${tone}|${unit.id}`)
    counts[tone]++
    notes.push({ index, tone, title, why, suggestion: tone === "red" ? text(item.suggestion) : null, unit, quote: quoted })
  }
  return notes
}

/**
 * The notes in an answer as they're kept in this browser: the ones notesOf
 * shows, each with the line it's marked on and that line's words, so the
 * same notes are shown wherever they're read back.
 */
export function keptNotesOf(notes: readonly SavedNote[], units: readonly Unit[]): SavedNote[] {
  return notesOf({ notes }, units).map(({ index, unit }) => ({ ...notes[index], line: unit?.id ?? "", text: unit?.text ?? null }))
}

/**
 * Kept notes on a resume that's been edited since: each found by its quote,
 * or by the words of the line it was marked on. Line ids are numbered down
 * the page, so an id from before a line was added or removed is another
 * line now; it's never used.
 */
export function notesNowOf(notes: readonly SavedNote[], units: readonly Unit[]): AiNote[] {
  const idOf = (text: string | null) => (text && units.find((unit) => comparable(unit.text) === comparable(text))?.id) || ""
  return notesOf({ notes: notes.map((note) => ({ ...note, line: idOf(note.text) })) }, units)
}
