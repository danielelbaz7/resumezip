// The resume as the AI review reads it: the printed PDF's lines in reading
// order, a bullet that wraps kept whole, each with an id the model points at.
// The model never sees where anything is on the page; a note's id is mapped
// back to its lines here, so a mark can only land on a line that's printed.

import type { PdfReading } from "@/lib/check/engine"
import { printedLayoutBullets } from "@/lib/check/pdf"
import type { ResumeView } from "@/lib/check/resume"
import type { Line } from "@/lib/import/lines"
import type { MarkedLine } from "../marks"

export interface Unit {
  /** "u1", "u2", … in reading order. */
  id: string
  bullet: boolean
  /** The whole text, a bullet's wrapped lines joined. */
  text: string
  /** The page it starts on; a bullet split over two pages is marked there. */
  page: number
  lines: MarkedLine[]
}

export function unitsOf(view: ResumeView, pdf: PdfReading): Unit[] {
  // Each bullet's lines, by its first line; the lines it wraps onto belong to it.
  const bullets = new Map<Line, Line[]>()
  const wrapped = new Set<Line>()
  for (const { printed } of printedLayoutBullets(view, pdf)) {
    const [first, ...rest] = printed.lines
    if (!first) continue
    bullets.set(first, printed.lines)
    for (const line of rest) wrapped.add(line)
  }
  // A bullet that isn't one of the form's (Relevant Coursework, in some
  // templates) is kept whole too: the lines under its text, until the next
  // bullet or a line that starts elsewhere.
  pdf.lines.forEach((line, index) => {
    if (!line.bullet || bullets.has(line) || wrapped.has(line)) return
    const lines = [line]
    for (const next of pdf.lines.slice(index + 1)) {
      const last = lines[lines.length - 1]
      const close = next.box && last.box && next.box[1] - last.box[3] < line.size
      if (next.bullet || next.page !== line.page || Math.abs(next.x - line.x) > 1.5 || !close || bullets.has(next)) break
      lines.push(next)
    }
    if (lines.length === 1) return
    bullets.set(line, lines)
    for (const each of lines.slice(1)) wrapped.add(each)
  })
  const units: Omit<Unit, "id">[] = []
  for (const line of pdf.lines) {
    if (wrapped.has(line) || !line.text.trim() || line.page === undefined) continue
    const lines = bullets.get(line) ?? [line]
    units.push({
      bullet: bullets.has(line) || line.bullet,
      text: lines.map((each) => each.text).join(" "),
      page: line.page,
      lines: lines.filter((each): each is MarkedLine => each.box !== undefined && each.page === line.page),
    })
  }
  return units.filter((unit) => unit.lines.length > 0).map((unit, index) => ({ id: `u${index + 1}`, ...unit }))
}

/** The lines the AI is sent and points at, or null when there are none: the PDF wasn't read, or has no line to point at. */
export function unitsToSend(view: ResumeView, pdf: PdfReading | null): Unit[] | null {
  const units = pdf ? unitsOf(view, pdf) : []
  return units.length > 0 ? units : null
}
