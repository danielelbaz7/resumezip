import { describe, expect, test } from "vitest"
import type { PdfReading } from "@/lib/check/engine"
import type { Line } from "@/lib/import/lines"
import { litOf } from "./ChangesContext"

// Each character 1 point wide, so a word's box is where it is in its line's text.
const measure = (text: string) => text.length
const line = (text: string, top: number): Line => ({
  parts: [{ text, x: 0, runs: [] }],
  text,
  bullet: false,
  left: 0,
  x: 0,
  size: 10,
  bold: false,
  italic: false,
  links: [],
  page: 1,
  box: [0, top, text.length, top + 10],
})

const reading = (lines: Line[], headings: { headingLine: number; section: string | null }[]): PdfReading =>
  ({
    lines,
    pages: [{ width: 612, height: 792 }],
    parsed: { occurrences: headings.map((heading) => ({ ...heading, heading: "" })) },
  }) as unknown as PdfReading

describe("where a tailored resume's changes are lit up on the preview", () => {
  const pdf = reading(
    [
      line("Ada Lovelace", 0),
      line("EXPERIENCE", 20),
      line("Built a Rust ledger", 40),
      line("SKILLS", 60),
      line("Languages: Go, Python, Rust", 80),
      line("Databases: PostgreSQL, Redis, and a very long list", 100),
      line("that wraps onto this line", 110),
    ],
    [
      { headingLine: 1, section: "Work" },
      { headingLine: 3, section: "Skills" },
    ],
  )

  test("is the words in the section they were added to, not the same words elsewhere", () => {
    const { lit, unfound } = litOf(pdf, [{ section: "Skills", label: "Skills · Languages", added: ["Rust"] }], measure)
    // "Rust" is in the experience bullet too, above; only the one in Skills is the change.
    expect(lit).toEqual([{ page: 1, box: [23, 80, 27, 90] }])
    expect(unfound).toBe(0)
  })

  test("is a run's whole lines when it wraps, and says when a run isn't on the page", () => {
    const wrapped = "Databases: PostgreSQL, Redis, and a very long list that wraps onto this line"
    const { lit, unfound } = litOf(pdf, [{ section: "Skills", label: "Skills · Databases", added: [wrapped, "Kubernetes"] }], measure)
    expect(lit.map(({ box }) => box[1])).toEqual([100, 110])
    expect(unfound).toBe(1)
  })
})
