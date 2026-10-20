// Deedy's left column, checked on the printed page: whatever is typed in
// Education and Skills stays inside the column, rather than printing into the
// gap between the columns or over the right one.

import { expect, test } from "vitest"
import type { PdfPage } from "@/lib/import/lines"
import { pagesOf, render, samples } from "@/lib/import/testRender"

type Resume = Record<string, unknown>
type Entry = Record<string, unknown>

const sample: Resume = samples.find((resume) => resume.selectedTemplate === "deedy")
const education = sample.educationSection as Entry[]
const skills = sample.skillsSection as Entry[]

/** The sample with its first school and first skill changed, and anything else in `more`. */
const changed = (school: Entry, skill: Entry, more: Resume = {}): Resume => ({
  ...sample,
  educationSection: [{ ...education[0], ...school }, ...education.slice(1)],
  skillsSection: [{ ...skills[0], ...skill }, ...skills.slice(1)],
  ...more,
})

const COMMAS = "Kubernetes,Terraform,Ansible,Prometheus,Grafana,Helm"

// deedy.typ's column-gutter.
const GUTTER = 0.3 * 72

type Item = PdfPage["items"][number]

/**
 * The left column's text, and where the column ends. The right column starts
 * where its first heading, the sample's Experience, does, and the left one
 * ends a gutter before that. On the first page the columns start level with
 * that heading, below the name and contacts, which run across the page.
 */
function leftColumn(pages: PdfPage[]): { items: Item[]; edge: number } {
  const right = pages[0].items.find((item) => item.text === "EXPERIENCE")
  if (!right) throw new Error("the right column's first heading isn't printed")
  const items = pages.flatMap(({ items }, page) =>
    items.filter((item) => item.x < right.x - 1 && (page > 0 || item.baseline <= right.baseline + 1)),
  )
  return { items, edge: right.x - GUTTER }
}

/** What runs past the column's edge, and by how much. */
const overflow = ({ items, edge }: { items: Item[]; edge: number }) =>
  items.filter((item) => item.right > edge + 0.5).map((item) => `"${item.text}" by ${(item.right - edge).toFixed(1)} pt`)

/** The words as printed, without spaces or the hyphens added to break a word. */
const printed = (items: Item[]) =>
  items
    .filter((item) => !item.soft)
    .map((item) => item.text)
    .join("")
    .replace(/\s+/g, "")

const LIST = COMMAS.split(/(?<=,)/)

// Each case: the resume, its left column's text as printed (without spaces),
// and the words in it that are printed whole, on one line.
const CASES: [name: string, resume: Resume, text: string, whole: string[]][] = [
  ["skills typed with commas but no spaces", changed({}, { skillDetails: COMMAS }), COMMAS, LIST],
  [
    "skills typed with slashes",
    changed({}, { skillDetails: "Python/TypeScript/JavaScript/PostgreSQL/GraphQL" }),
    "Python/TypeScript/JavaScript/PostgreSQL/GraphQL",
    ["Python/", "TypeScript/", "JavaScript/", "PostgreSQL/", "GraphQL"],
  ],
  ["a long German degree", changed({ degree: "Informationstechnologiemanagement" }, {}), "Informationstechnologiemanagement", []],
  [
    "a long one-word school, in capitals",
    changed({ schoolName: "Rechtswissenschaftsuniversitätsfakultät" }, {}),
    "RECHTSWISSENSCHAFTSUNIVERSITÄTSFAKULTÄT",
    [],
  ],
  [
    "a long one-word heading",
    changed({}, {}, { headings: { skills: "Programmierkenntnisse" } }),
    "PROGRAMMIERKENNTNISSE",
    ["PROGRAMMIERKENNTNISSE"],
  ],
  [
    "a long word in a heading of several",
    changed({}, {}, { headings: { skills: "Programmierkenntnisse und Werkzeuge" } }),
    "PROGRAMMIERKENNTNISSEUNDWERKZEUGE",
    ["PROGRAMMIERKENNTNISSE", "WERKZEUGE"],
  ],
  [
    "skills and a heading at a larger text size",
    changed({}, { skillDetails: COMMAS }, { headings: { skills: "Programmierkenntnisse" }, tune: { size: 1.15 } }),
    `PROGRAMMIERKENNTNISSE${skills[0].skillName}`.toUpperCase() + COMMAS,
    ["PROGRAMMIERKENNTNISSE", ...LIST],
  ],
]

test.each(CASES)("%s stay in the left column", async (_, resume, text, whole) => {
  const column = leftColumn(await pagesOf(await render(resume)))
  expect(overflow(column)).toEqual([])
  // All of it, broken only where it has to be: a list after its commas or
  // slashes, and a heading made smaller rather than broken.
  expect(printed(column.items)).toContain(text)
  expect(whole.filter((word) => !column.items.some((item) => item.text.includes(word)))).toEqual([])
})

test("a left column too long for the page carries on onto the next, inside the column there too", async () => {
  const many = Array.from({ length: 24 }, (_, i) => ({ id: i + 1, skillName: `Group ${i + 1}`, skillDetails: COMMAS }))
  const pages = await pagesOf(await render({ ...sample, skillsSection: many }))
  expect(pages.length).toBeGreaterThan(1)
  const column = leftColumn(pages)
  expect(overflow(column)).toEqual([])
  expect(printed(column.items)).toContain(many.map(({ skillName }) => skillName.toUpperCase().replace(/\s+/g, "") + COMMAS).join(""))
  expect(printed(pages.at(-1)!.items)).toContain(`GROUP24${COMMAS}`)
})

test("the sample's left column is inside it, on one page", async () => {
  const pages = await pagesOf(await render(sample))
  expect(pages).toHaveLength(1)
  expect(overflow(leftColumn(pages))).toEqual([])
})
