// Serializable expectations sent to the import worker with a preview. Heading
// names alone cannot identify custom sections: two can share a name, including
// a builtin name. Only a complete, ordered text occurrence is removed before
// the builtin semantic reader runs.
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

/** Builtin headings anchor occurrences, but their fields keep their existing semantic rules. */
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
 * Match repeated headings one-to-one in source order. An unexpected duplicate
 * or changed/missing body is deliberately unresolved, rather than attributed
 * to whichever custom ID happens to be first. Exact normalized body equality
 * prevents hiding unrelated extracted text from R4.
 */
export function matchExtraPdf(lines: Line[], layout: readonly PdfSectionLayout[]): ExtraPdfReading {
  const headings = new Set(layout.map((section) => comparable(section.heading)))
  const normalized = lines.map((line) => comparable(line.text))
  const allStarts = lines.flatMap((_, index) => (headings.has(normalized[index]) ? [index] : []))
  // Prose can literally contain another section's heading on a line of its
  // own. Recognize a full expected body before deciding which heading-shaped
  // lines are boundaries; matching bodies own their interior lines.
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
  const interiorsOf = (skip: ReadonlySet<PdfSectionLayout>) => {
    const interiors = new Set<number>()
    for (const [section, { found }] of bodies)
      if (!skip.has(section))
        for (const range of found) for (const index of allStarts) if (index > range.start && index < range.end) interiors.add(index)
    return interiors
  }
  const interiors = interiorsOf(new Set())
  const expected = new Map<string, PdfSectionLayout[]>()
  for (const section of layout) {
    const heading = comparable(section.heading)
    expected.set(heading, [...(expected.get(heading) ?? []), section])
  }
  const deficient = new Set(
    [...expected]
      .filter(
        ([heading, peers]) => allStarts.filter((index) => normalized[index] === heading && !interiors.has(index)).length < peers.length,
      )
      .map(([heading]) => heading),
  )
  const ambiguousOwnership = new Set<PdfSectionLayout>()
  for (const [section, { found }] of bodies)
    if (found.some((range) => allStarts.some((index) => index > range.start && index < range.end && deficient.has(normalized[index]))))
      ambiguousOwnership.add(section)
  // A matching prose suffix must not swallow the only heading occurrence
  // needed by another expected section. Missing custom text followed by a
  // real builtin 'Awards / Prize' is otherwise indistinguishable from prose
  // that literally ends with those words.
  const owned = interiorsOf(ambiguousOwnership)
  const starts = allStarts.filter((index) => !owned.has(index))
  const ranges = starts.map((start, index) => ({ start, end: starts[index + 1] ?? lines.length, heading: normalized[start] }))
  const sections: ExtraPdfMatch[] = []
  const excludedLines: number[] = []
  const assigned = layout.map((section) => {
    const heading = comparable(section.heading)
    const candidates = ranges.filter((range) => range.heading === heading)
    const peers = expected.get(heading)!
    return { candidates, range: candidates.length === peers.length ? candidates[peers.indexOf(section)] : undefined }
  })
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
    if (ambiguousOwnership.has(section)) {
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
