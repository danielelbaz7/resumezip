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

// Fewer first words than this could end a field they aren't from. Two is
// enough for a job title ("Software Engineer") at the start of a printed line.
const LEAST_WORDS = 2

/**
 * The field the quoted words are in, or null once they aren't anywhere. A
 * quote that runs across two fields (a degree and its GPA, printed on one
 * line) is found by as many of its first words as end a field: a field
 * that goes on with other words after them has been rewritten.
 */
export function placeOfQuote(view: ResumeView, quote: string): Place | null {
  const wanted = comparable(quote)
  if (!wanted) return null
  // Every printed text with a field, the added sections' too, as the checker reads them.
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

/**
 * The field a kept note is about: where its quoted words are, or else where
 * the words of the line it was marked on are, for a note on a whole line or
 * one whose quote the AI reworded. Null once they've been rewritten.
 */
export function placeOfNote(view: ResumeView, note: SavedNote): Place | null {
  return placeOfQuote(view, note.quote) ?? (note.text ? placeOfQuote(view, note.text) : null)
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
    key: `${AI_RULE}:${index}`,
    dismissed: false,
    flag: note.tone,
  }
}
