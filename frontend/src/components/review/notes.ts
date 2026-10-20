// The notes the review page and the editor mark a resume with, from the
// checker's findings or the AI's notes, each with where its mark goes.

import type { Finding, PdfReading } from "@/lib/check/engine"
import { describePlace } from "@/lib/check/labels"
import type { ResumeView } from "@/lib/check/resume"
import type { AiNote } from "@/lib/review/ai/answer"
import { aiScribbleOf, marksOf, scribbleOf } from "@/lib/review/marks"
import type { Note } from "./PageMarks"

/** The key a checker finding's note goes by, which its row in the Check panel uses too. */
export const checkKeyOf = (finding: Finding) => `check:${finding.key}`

/** The key an AI note goes by: its place in what the AI sent, as it's saved. */
export const aiKeyOf = (index: number) => `ai:${index}`

/** The checker's findings as notes, drawn where they're printed in `pdf`, if it's been read. */
export function checkNotesOf(
  view: ResumeView,
  findings: readonly Finding[],
  pdf: PdfReading | null,
  measure: (text: string) => number,
): Note[] {
  const marks = marksOf(view, findings, pdf)
  const seen = new Set<string>()
  return findings.flatMap((finding, index): Note[] => {
    // One rule can find the same thing twice at a place, as a word typed twice; one mark is enough.
    const key = checkKeyOf(finding)
    if (seen.has(key)) return []
    seen.add(key)
    const mark = marks[index]
    const fix = finding.level === "fix" && !finding.advisory
    return [
      {
        key,
        ink: fix ? "fix" : "look",
        label: fix ? "Must fix" : null,
        title: finding.message,
        body: finding.suggestion ?? null,
        rewrite: null,
        place: describePlace(view, finding.place),
        drawn: mark ? { page: mark.page, scribble: scribbleOf(finding, mark, measure) } : null,
      },
    ]
  })
}

// What the list under the page calls an AI note's line: its first words.
const placeOf = (text: string) => (text.length > 48 ? `“${text.slice(0, 46).trimEnd()}…”` : `“${text}”`)

/** The AI's notes, drawn on the lines they're about. */
export function aiNotesOf(notes: readonly AiNote[], measure: (text: string) => number): Note[] {
  return notes.map((note) => {
    const scribble = aiScribbleOf(note, measure)
    return {
      key: aiKeyOf(note.index),
      // The AI calls what works a green flag; the page calls it done well, in blue.
      ink: note.tone === "red" ? "red" : "good",
      label: note.tone === "red" ? "Red flag" : "Done well",
      title: note.title,
      body: note.why,
      rewrite: note.suggestion,
      place: note.unit ? placeOf(note.unit.text) : "On your resume",
      drawn: note.unit && scribble ? { page: note.unit.page, scribble } : null,
    }
  })
}
