// Where an AI note is in the editor's form. The note knows the words it
// quotes, not a field: the field is found by those words, as the resume is
// now. Once they've been rewritten, the note has no place, which is how the
// editor tells it's been acted on.

import type { Finding } from "@/lib/check/engine"
import { comparable } from "@/lib/check/pdf"
import type { Place } from "@/lib/check/places"
import { textsOf, type ResumeView } from "@/lib/check/resume"
import type { SavedNote } from "./saved"

/** The rule an AI note goes by when it's opened like a finding (CheckContext's open). */
export const AI_RULE = "AI"

// Fewer words than this would be found in fields they aren't from.
const LEAST_WORDS = 3

/**
 * The field the quoted words are in, or null once they aren't anywhere. A
 * quote that runs across two fields (a degree and its GPA, printed on one
 * line) is found by as many of its first words as end a field: a field
 * that goes on with other words after them has been rewritten.
 */
export function placeOfQuote(view: ResumeView, quote: string): Place | null {
  const wanted = comparable(quote)
  if (!wanted) return null
  // Every printed text with a field, custom sections' text too, as the checker reads them.
  const texts = textsOf(view).map(({ place, text }) => ({ place, text: comparable(text) }))
  const whole = texts.find(({ text }) => text.includes(wanted))
  if (whole) return whole.place
  const words = quote.trim().split(/\s+/)
  for (let count = words.length - 1; count >= LEAST_WORDS; count--) {
    const start = comparable(words.slice(0, count).join(" "))
    const ended = start && texts.find(({ text }) => text.endsWith(start))
    if (ended) return ended.place
  }
  return null
}

/** An AI note as a finding, so choosing it opens its field as choosing a finding does. */
export function findingOf(note: SavedNote, place: Place, index: number): Finding {
  return {
    rule: AI_RULE,
    level: "look",
    category: "bullets",
    place,
    message: note.title,
    why: note.why,
    ...(note.suggestion && { suggestion: note.suggestion }),
    text: note.quote,
    // Its tone goes in its key, the one part of a finding that's free to say it.
    key: `${AI_RULE}:${note.tone}:${index}`,
    dismissed: false,
  }
}

/** An AI note's flag, red or green, when a finding is one (findingOf); null for the checker's. */
export function aiToneOf(finding: Finding): "red" | "green" | null {
  if (finding.rule !== AI_RULE) return null
  return finding.key.startsWith(`${AI_RULE}:green:`) ? "green" : "red"
}
