// Where each finding is printed, so the review page can mark it on the page:
// a bullet on the lines the PDF prints it on (printedLayoutBullets), a role's
// bullets as a whole on all of theirs, and anything else on the first line
// that holds its text. A finding about a whole entry or section, or the PDF
// itself, has no line of its own, so it isn't marked; the page lists it below.

import type { Finding, PdfReading } from "@/lib/check/engine"
import type { AiNote } from "./ai/answer"
import { comparable, printedLayoutBullets } from "@/lib/check/pdf"
import { placeId } from "@/lib/check/places"
import type { ResumeView } from "@/lib/check/resume"
import { escaped } from "@/lib/check/text"
import type { Line } from "@/lib/import/lines"

/** [left, top, right, bottom], in PDF points from the page's top-left. */
export type Box = [number, number, number, number]

/** A printed line, with where it is. */
export type MarkedLine = Line & { box: Box }

/** Where a finding is printed: its page (from 1), and its lines there. */
export interface Mark {
  page: number
  lines: MarkedLine[]
}

/** The pen marks drawn on the page, as crackedresume draws them. */
export type ScribbleKind = "box" | "circle" | "strike" | "bracket" | "underline"

export interface Scribble {
  kind: ScribbleKind
  /** The word's box, or each line's. */
  boxes: Box[]
}

// Shorter text is too likely to be found on a line it isn't about.
const LEAST_TEXT = 4

// The words a finding is about, when its message quotes them: “Responsible for” is a weak start.
const QUOTED = /“([^”]+)”/

/** Each finding's mark, in the findings' order; null where it isn't on a line of its own. */
export function marksOf(view: ResumeView, findings: readonly Finding[], pdf: PdfReading | null): (Mark | null)[] {
  if (!pdf) return findings.map(() => null)
  const printedBullets = printedLayoutBullets(view, pdf)
  const bullets = new Map(printedBullets.map(({ place, printed }) => [placeId(place), printed.lines]))
  // A field of bullets as a whole, as "this role's bullets": all of its bullets' lines.
  const fields = new Map<string, Line[]>()
  for (const { place, printed } of printedBullets) {
    if (place.kind !== "entry") continue
    const field = placeId({ ...place, line: undefined })
    fields.set(field, [...(fields.get(field) ?? []), ...printed.lines])
  }
  const lines = pdf.lines.map((line) => ({ line, text: comparable(line.text) }))
  return findings.map((finding) => {
    const printed =
      bullets.get(placeId(finding.place)) ??
      fields.get(placeId(finding.place)) ??
      (comparable(finding.text).length >= LEAST_TEXT
        ? lines
            .filter(({ text }) => text.includes(comparable(finding.text)))
            .slice(0, 1)
            .map(({ line }) => line)
        : [])
    // A bullet split over two pages is marked where it starts.
    const page = printed[0]?.page
    const marked = printed.filter((line): line is MarkedLine => line.page === page && line.box !== undefined)
    return page !== undefined && marked.length > 0 ? { page, lines: marked } : null
  })
}

/**
 * Where `words` are printed on one of `lines`, as a whole word. A line only
 * knows where each of its parts starts, so the words' place in their part is
 * worked out from how wide its text is: `measure` gives a width in any unit,
 * scaled to the line by its last part, which ends where the line does.
 */
export function wordBox(lines: readonly MarkedLine[], words: string, measure: (text: string) => number): Box | null {
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped(words)}(?![\\p{L}\\p{N}])`, "iu")
  for (const line of lines) {
    const [, top, right, bottom] = line.box
    // The first part starts after the bullet the line's text was taken from.
    const start = (index: number) => (index === 0 ? line.x : line.parts[index].x)
    const last = line.parts.length - 1
    const scale = (right - start(last)) / measure(line.parts[last].text)
    if (!(scale > 0) || !Number.isFinite(scale)) continue
    for (const [index, part] of line.parts.entries()) {
      const found = pattern.exec(part.text)
      if (!found) continue
      const left = start(index) + scale * measure(part.text.slice(0, found.index))
      return [left, top, left + scale * measure(found[0]), bottom]
    }
  }
  return null
}

/**
 * How a finding is scribbled on its mark. When its message quotes words that
 * are printed there: a box round them if the line opens with them, else a
 * circle, or a line through them if they're a must-fix. Otherwise beside its
 * lines: a bracket for several, a box for a must-fix, and an underline.
 */
export function scribbleOf(finding: Finding, mark: Mark, measure: (text: string) => number): Scribble {
  const fix = finding.level === "fix" && !finding.advisory
  const quoted = finding.message.match(QUOTED)?.[1]
  const word = quoted ? wordBox(mark.lines, quoted, measure) : null
  if (word) {
    const opens = mark.lines.some(({ box: [, top], x }) => top === word[1] && Math.abs(word[0] - x) < 1)
    return { kind: fix ? "strike" : opens ? "box" : "circle", boxes: [word] }
  }
  const boxes = mark.lines.map(({ box }) => box)
  return { kind: boxes.length > 1 ? "bracket" : fix ? "box" : "underline", boxes }
}

/**
 * How an AI note is drawn on its line: a red flag circles the words it
 * quotes, or underlines them when they're more than a few, or marks the
 * whole bullet beside it; a green flag underlines its words, or its lines.
 */
export function aiScribbleOf({ tone, unit, quote }: AiNote, measure: (text: string) => number): Scribble | null {
  if (!unit) return null
  const word = quote ? wordBox(unit.lines, quote, measure) : null
  const boxes = word ? [word] : unit.lines.map(({ box }) => box)
  if (tone === "green") return { kind: "underline", boxes }
  if (word) return { kind: quote!.trim().split(/\s+/).length <= 4 ? "circle" : "underline", boxes }
  return { kind: boxes.length > 1 ? "bracket" : "underline", boxes }
}
