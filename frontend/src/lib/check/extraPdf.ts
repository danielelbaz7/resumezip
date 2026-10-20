// Finds the sections the person added in the preview's text, in the import
// worker, so the reader doesn't take their lines for jobs. A title can't tell
// them apart (two can share one, or share the editor's “Experience”), so a
// section counts as found only where its title is followed by exactly its text.
import type { SectionName } from "@/components/editor/sections"
import type { Line } from "@/lib/import/lines"
import { extraKey } from "@/lib/resumeSections"
import { comparable } from "./pdf"
import type { Place } from "./places"
import { extraTexts, type ResumeView } from "./resume"

export interface PdfTextPart {
  text: string
  place: Place
}
export interface PdfSectionLayout {
  ref: string
  heading: string
  parts: PdfTextPart[]
}
export interface ExtraPdfMatch {
  sectionId: string
  status: "matched" | "missing" | "ambiguous"
  parts: { place: Place; lines: number[] }[]
}
export interface ExtraPdfReading {
  sections: ExtraPdfMatch[]
  excludedLines: number[]
}

/**
 * The sections the preview prints, in order, each with its title, and for one
 * the person added, its text in parts, with where each part is in the editor.
 * The editor's sections need only their titles, which end the text before them.
 */
export function pdfLayoutOf(view: ResumeView): PdfSectionLayout[] {
  return view.allOrder.flatMap((ref) => {
    const id = extraKey(ref)
    if (id === null) {
      const name = ref as SectionName
      return view.sections[name].some((entry) => !entry.blank) ? [{ ref, heading: view.printedHeadings[name], parts: [] }] : []
    }
    const extra = view.extras[id]
    if (!extra || extra.blank) return []
    const parts = extraTexts(view, id).filter(({ place }) => place.kind !== "extra-heading")
    return [{ ref, heading: extra.heading, parts }]
  })
}

/**
 * Matches each added section's title, in order, to one printed with exactly
 * its text. When a title is printed more or fewer times than expected, the
 * text differs or the order is wrong, it says so rather than guess which is
 * which. Only exact matches are taken out of what the reader reads, so no
 * other text is hidden from R4.
 */
export function matchExtraPdf(lines: Line[], layout: readonly PdfSectionLayout[]): ExtraPdfReading {
  const headings = new Set(layout.map((section) => comparable(section.heading)))
  const normalized = lines.map((line) => comparable(line.text))
  // The lines that read as one of the titles.
  const allStarts = lines.flatMap((_, index) => (headings.has(normalized[index]) ? [index] : []))
  // An added section's text can hold another section's title on a line of its
  // own, so first find where each one's title is followed by its whole text.
  const bodies = new Map<PdfSectionLayout, { want: string; found: { start: number; end: number }[] }>()
  for (const section of layout) {
    if (extraKey(section.ref) === null) continue
    const want = section.parts.map(({ text }) => comparable(text)).join("")
    const found: { start: number; end: number }[] = []
    for (const start of allStarts.filter((index) => normalized[index] === comparable(section.heading))) {
      let got = ""
      let end = start + 1
      while (got.length < want.length && end < lines.length && want.startsWith(got + normalized[end])) got += normalized[end++]
      if (got === want && want) found.push({ start, end })
    }
    bodies.set(section, { want, found })
  }
  // The lines that read as a title but are inside a section's text as found,
  // leaving out the texts of the sections in `skip`.
  const titlesInText = (skip: ReadonlySet<PdfSectionLayout>) => {
    const inText = new Set<number>()
    for (const [section, { found }] of bodies)
      if (!skip.has(section))
        for (const range of found) for (const index of allStarts) if (index > range.start && index < range.end) inText.add(index)
    return inText
  }
  const inText = titlesInText(new Set())
  const expected = new Map<string, PdfSectionLayout[]>()
  for (const section of layout) {
    const heading = comparable(section.heading)
    expected.set(heading, [...(expected.get(heading) ?? []), section])
  }
  // A title inside a section's text doesn't start a section, unless that text
  // holds a title printed too few times without it: “Awards” then “Prize” may
  // end the text, or be the Awards section after text that didn't print. Then
  // that section isn't found for sure, and the titles in its text start
  // sections as usual.
  const tooFew = new Set(
    [...expected]
      .filter(([heading, peers]) => allStarts.filter((index) => normalized[index] === heading && !inText.has(index)).length < peers.length)
      .map(([heading]) => heading),
  )
  const mayHoldTitle = new Set<PdfSectionLayout>()
  for (const [section, { found }] of bodies)
    if (found.some((range) => allStarts.some((index) => index > range.start && index < range.end && tooFew.has(normalized[index]))))
      mayHoldTitle.add(section)
  const notStarts = titlesInText(mayHoldTitle)
  const starts = allStarts.filter((index) => !notStarts.has(index))
  const ranges = starts.map((start, index) => ({ start, end: starts[index + 1] ?? lines.length, heading: normalized[start] }))
  const sections: ExtraPdfMatch[] = []
  const excludedLines: number[] = []
  const assigned = layout.map((section) => {
    const heading = comparable(section.heading)
    const candidates = ranges.filter((range) => range.heading === heading)
    const peers = expected.get(heading)!
    return { candidates, range: candidates.length === peers.length ? candidates[peers.indexOf(section)] : undefined }
  })
  // Where the sections printed before and after each one start, as its title
  // must come between them. Found out of order, the text wasn't read in the
  // order it's printed, so which title is whose would be a guess.
  const before: number[] = []
  let maximum = -Infinity
  for (const { range } of assigned) {
    before.push(maximum)
    if (range) maximum = Math.max(maximum, range.start)
  }
  const after: number[] = []
  let minimum = Infinity
  for (let i = assigned.length - 1; i >= 0; i--) {
    after[i] = minimum
    const { range } = assigned[i]
    if (range) minimum = Math.min(minimum, range.start)
  }
  for (const [sectionIndex, section] of layout.entries()) {
    const sectionId = extraKey(section.ref)
    if (sectionId === null) continue
    const { candidates, range } = assigned[sectionIndex]
    const empty = { sectionId, parts: [] }
    if (mayHoldTitle.has(section)) {
      sections.push({ ...empty, status: "ambiguous" })
      continue
    }
    if (!range) {
      sections.push({ ...empty, status: candidates.length === 0 ? "missing" : "ambiguous" })
      continue
    }
    if (range.start <= before[sectionIndex] || range.start >= after[sectionIndex]) {
      sections.push({ ...empty, status: "ambiguous" })
      continue
    }
    const { want, found } = bodies.get(section)!
    if (!found.some((body) => body.start === range.start)) {
      sections.push({ ...empty, status: "missing" })
      continue
    }
    const body = normalized.slice(range.start + 1, range.end)
    if (body.join("") !== want) {
      sections.push({ ...empty, status: "missing" })
      continue
    }
    const indexes = Array.from({ length: range.end - range.start }, (_, index) => range.start + index)
    const offsets = body.reduce<number[]>((out, text) => [...out, out[out.length - 1] + text.length], [0])
    let offset = 0
    const parts = section.parts.flatMap((part) => {
      const start = offset
      offset += comparable(part.text).length
      if (start === offset) return []
      return [
        { place: part.place, lines: body.flatMap((_, i) => (offsets[i] < offset && offsets[i + 1] > start ? [range.start + 1 + i] : [])) },
      ]
    })
    sections.push({ sectionId, status: "matched", parts })
    excludedLines.push(...indexes)
  }
  return { sections, excludedLines }
}
