// Where an AI note is in the editor's form. The note knows the words it
// quotes, not a field: the field is found by those words, as the resume is
// now. Once they've been rewritten, the note has no place, which is how the
// editor tells it's been acted on.

import type { Finding } from "@/lib/check/engine"
import { comparable } from "@/lib/check/pdf"
import type { Place } from "@/lib/check/places"
import type { ResumeView } from "@/lib/check/resume"
import { layoutBulletsIn } from "@/lib/check/text"
import type { ProfileKey } from "@/components/editor/sections"
import type { SavedNote } from "./saved"

/** The rule an AI note goes by when it's opened like a finding (CheckContext's open). */
export const AI_RULE = "AI"

// Fewer words than this would be found in fields they aren't from.
const LEAST_WORDS = 3

function placeOfWords(view: ResumeView, wanted: string): Place | null {
  for (const { bullet, place } of layoutBulletsIn(view)) if (comparable(bullet.text).includes(wanted)) return place
  for (const [field, value] of Object.entries(view.profile)) {
    if (value && comparable(value).includes(wanted)) return { kind: "profile", field: field as ProfileKey }
  }
  for (const section of view.order) {
    for (const entry of view.sections[section]) {
      for (const [field, value] of Object.entries(entry.values)) {
        if (value && comparable(value).includes(wanted)) return { kind: "entry", section, entry: entry.index, field: field as never }
      }
    }
  }
  return null
}

/**
 * The field the quoted words are in, or null once they aren't anywhere. A
 * quote that runs across two fields (a degree and its GPA, printed on one
 * line) is found by as many of its first words as one field holds.
 */
export function placeOfQuote(view: ResumeView, quote: string): Place | null {
  const words = quote.trim().split(/\s+/)
  for (let count = words.length; count >= Math.min(LEAST_WORDS, words.length); count--) {
    const wanted = comparable(words.slice(0, count).join(" "))
    if (!wanted) return null
    const place = placeOfWords(view, wanted)
    if (place) return place
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
