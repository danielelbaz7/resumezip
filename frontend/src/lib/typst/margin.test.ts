// Margin hangs each section's heading in a column of its own, left of the
// text (templates/margin.typ). However long a heading's words, and wherever
// Fine-tune sets the margins and the text size, the heading stays in that
// column, inside the page margin, and on one page.

import { describe, expect, test } from "vitest"
import type { PdfPage } from "@/lib/import/lines"
import { pagesOf, render, samples } from "@/lib/import/testRender"
import { TEMPLATE_SETTINGS, type Tune } from "@/lib/tune"

const sample: Record<string, unknown> = samples.find((resume) => resume.selectedTemplate === "margin")

// From margin.typ, in points at Fine-tune's own settings: the headings'
// column and their text size, which both follow the text size, and the gutter
// between the column and the text, which doesn't.
const COLUMN = 0.98 * 72
const HEADING_SIZE = 10.8
const GUTTER = 0.2 * 72

// Words wider than the column: three in English, then German for
// "Publications" and "Programming skills", over sections the sample has.
const LONG = {
  work: "Internationalization",
  leadership: "Extracurriculars",
  volunteer: "Responsibilities",
  projects: "Veröffentlichungen",
  skills: "Programmierkenntnisse",
}
// The sample's other headings, which fit.
const OWN = ["Summary", "Education", "Awards & Certifications"]

type Item = PdfPage["items"][number]

/** A heading as printed: its lines, top to bottom, and the page they're on (0 for the first). */
interface Heading {
  text: string
  lines: Item[]
  page: number
}

/** Where the page margin, the headings' column and the text start, from the paper's left edge. */
function columnsOf({ margin = 1, size = 1 }: Tune) {
  const page = TEMPLATE_SETTINGS.margin.margin * 72 * margin
  return { page, column: page + COLUMN * size, text: page + COLUMN * size + GUTTER }
}

/**
 * What's printed left of the text: the headings. Lines a line apart belong to
 * one heading, so a heading split across two pages reads as two. Hyphens that
 * break a word aren't read as text, so a hyphenated word reads whole.
 */
function headingsOf(pages: PdfPage[], tune: Tune): Heading[] {
  const { text } = columnsOf(tune)
  const headings: Heading[] = []
  pages.forEach(({ items }, page) => {
    for (const item of items.filter((item) => item.x < text - 1)) {
      const last = headings[headings.length - 1]
      if (last?.page === page && last.lines[last.lines.length - 1].baseline - item.baseline <= 1.6 * item.size) last.lines.push(item)
      else headings.push({ text: "", lines: [item], page })
    }
  })
  for (const heading of headings) {
    heading.text = heading.lines.map((line) => line.text.trim()).join(" ")
  }
  return headings
}

/** A heading's words, without the spaces between them or where its lines break. */
const squeezed = (text: string) => text.replace(/\s/g, "")

describe.each<Tune>([
  {},
  { margin: 0.6 },
  { margin: 1.4 },
  { size: 0.85 },
  { size: 1.15 },
  { margin: 0.6, size: 0.85 },
  { margin: 0.6, size: 1.15 },
  { margin: 1.4, size: 1.15 },
])("with Fine-tune at %o", (tune) => {
  test("keeps headings with words wider than their column in the column, inside the page margin", async () => {
    const headings = headingsOf(await pagesOf(await render({ ...sample, headings: LONG, tune })), tune)
    const { page, column } = columnsOf(tune)
    // "Certifications", in the sample's own Awards heading, starts 0.2 pt left
    // of the column, though its first letter's ink is inside it: a word is
    // left as it is when it's that little too wide.
    const allowance = 0.03 * HEADING_SIZE * (tune.size ?? 1)
    for (const line of headings.flatMap((heading) => heading.lines)) {
      expect(line.x, `"${line.text}" starts`).toBeGreaterThanOrEqual(page - allowance)
      expect(line.right, `"${line.text}" ends`).toBeLessThanOrEqual(column + 0.1)
    }
    // Every heading is printed, whole.
    expect(headings.map((heading) => squeezed(heading.text)).sort()).toEqual([...Object.values(LONG), ...OWN].map(squeezed).sort())
  })
})

test("hyphenates a word wider than the column, at the heading's size, and leaves the rest as they were", async () => {
  const headings = headingsOf(await pagesOf(await render({ ...sample, headings: LONG })), {})
  for (const word of Object.values(LONG)) {
    const heading = headings.find((heading) => squeezed(heading.text) === word)
    expect(heading?.lines.length, word).toBeGreaterThan(1)
    for (const line of heading!.lines) expect(line.size, word).toBeCloseTo(HEADING_SIZE, 1)
  }
  for (const text of OWN) {
    const heading = headings.find((heading) => heading.text === text)
    const sizes = heading?.lines.map((line) => Math.round(line.size * 100) / 100)
    expect(sizes, text).toEqual(text === "Awards & Certifications" ? [HEADING_SIZE, HEADING_SIZE] : [HEADING_SIZE])
  }
})

test("sets a heading smaller when hyphenation can't break a word in it to fit the column", async () => {
  // English hyphenation, for the resume's language, has no places to break
  // a word in another alphabet.
  const word = "Профессиональный"
  const tune = { margin: 0.6 }
  const headings = headingsOf(await pagesOf(await render({ ...sample, headings: { work: `${word} опыт` }, tune })), tune)
  const heading = headings.find((heading) => heading.text.startsWith(word))
  const { page, column } = columnsOf(tune)
  expect(heading?.lines.map((line) => line.text.trim())).toEqual([word, "опыт"])
  const [line, next] = heading!.lines
  expect(line.x).toBeGreaterThanOrEqual(page)
  expect(line.right).toBeLessThanOrEqual(column + 0.1)
  expect(line.size).toBeLessThan(HEADING_SIZE)
  // The whole heading, so its words are the same size.
  expect(next.size).toBeCloseTo(line.size, 2)
})

test("keeps a heading's lines together, on the page its section starts on", async () => {
  // The last section's heading, seven lines long, starts near the foot of the
  // first page, with room for its section's four lines but not for its own.
  const awards = "Honors, Awards, Grants, Prizes, Fellowships and Certifications"
  const pages = await pagesOf(await render({ ...sample, headings: { awards } }))
  const headings = headingsOf(pages, {})
  const heading = headings.find((heading) => heading.text.startsWith("Honors"))
  expect(heading?.text).toBe(awards)
  expect(heading?.lines.length).toBeGreaterThanOrEqual(4)
  // The section's first line goes with them.
  const first = pages.findIndex(({ items }) => items.some((item) => item.text.includes("Product Excellence Award")))
  expect(first).toBe(heading?.page)
})
