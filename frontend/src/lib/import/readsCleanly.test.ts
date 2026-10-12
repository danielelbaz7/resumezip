// Every template's sample, read as plain text the way hiring software reads a
// PDF: its text in reading order, before anything resumezip's own reader
// works out (issue #186). What breaks search or parsing there can't be seen
// on the page: a letter pair the font drew as one sign, a date range split
// over two lines, sections read out of order, the contact details below the
// first heading, a heading run into the text beside it.

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { PDFDocumentProxy } from "pdfjs-dist"
import type { TextItem } from "pdfjs-dist/types/src/display/api"
import { describe, expect, test } from "vitest"
import { SECTIONS, type SectionName } from "@/components/editor/sections"
import { comparable } from "@/lib/check/pdf"
import { firstColumnOf, templateById, TEMPLATES } from "@/lib/templates"
import { toTemplateData, type TemplateData } from "@/lib/typst/resumeData"
import { linesFromPages, readPdf, type Line } from "./lines"
import { render, samples } from "./testRender"

/** What hiring software reads of a PDF. */
interface PlainText {
  /** Its lines in reading order, nothing more. */
  lines: Line[]
  /** Its text, a piece at a time, exactly as the PDF maps it to characters. */
  characters: string[]
}

/**
 * A PDF as hiring software reads it. pdf.js normalizes text by default,
 * turning "ﬁ" into "fi", which hides the very ligatures other readers pass
 * on, so the characters are read without it.
 */
async function plainText(pdf: Uint8Array): Promise<PlainText> {
  const doc = (await getDocument({ data: pdf, isEvalSupported: false }).promise) as unknown as PDFDocumentProxy
  try {
    const characters: string[] = []
    for (let number = 1; number <= doc.numPages; number++) {
      const { items } = await (await doc.getPage(number)).getTextContent({ disableNormalization: true })
      characters.push(...(items as TextItem[]).map((item) => item.str).filter((text) => text.trim()))
    }
    return { lines: linesFromPages(await readPdf(doc)), characters }
  } finally {
    await doc.destroy()
  }
}

// Ligatures (ﬀ ﬁ ﬂ ﬃ ﬄ ﬅ ﬆ), the replacement character, NUL, and pdf.js's
// placeholder for a glyph it can't map to a character: "certiﬁed" isn't found
// by a search for "certified".
const UNREADABLE = /[\uFB00-\uFB06\uFFFD\0]|\(cid:\d*\)?/gu

const KINDS: Record<SectionName, keyof TemplateData["headings"]> = {
  Education: "education",
  Work: "work",
  Projects: "projects",
  Publications: "publications",
  Skills: "skills",
  Leadership: "leadership",
  Volunteership: "volunteer",
  Awards: "awards",
}

/**
 * The headings the resume prints, in the order its PDF holds them: any
 * column on the left first, then the summary, then the other sections.
 */
function printedHeadings(resume: Record<string, unknown>, data: TemplateData): string[] {
  const sections = data.order.flatMap((name) => {
    const kind = KINDS[name as SectionName]
    if (!kind || data[kind].length === 0) return []
    return [{ name, heading: data.headings[kind] || SECTIONS[name as SectionName].title }]
  })
  const first = firstColumnOf(templateById(resume.selectedTemplate))
  return [
    ...sections.filter(({ name }) => first.includes(name)),
    ...(data.summary.length ? [{ name: "Summary", heading: "Summary" }] : []),
    ...sections.filter(({ name }) => !first.includes(name)),
  ].map(({ heading }) => heading)
}

/** What would read wrongly as plain text, each naming the text that broke. */
function readingProblems(resume: Record<string, unknown>, { lines, characters }: PlainText): string[] {
  const problems: string[] = []
  const texts = lines.map((line) => line.text)
  const flat = texts.map(comparable)

  for (const text of characters) {
    const signs = text.match(UNREADABLE)
    if (signs) problems.push(`unreadable ${signs.map((sign) => JSON.stringify(sign)).join(", ")} in "${text}"`)
  }

  const data = toTemplateData(resume)
  for (const { start, end } of [...data.education, ...data.work, ...data.leadership, ...data.volunteer]) {
    if (start && end && !flat.some((line) => line.includes(comparable(start) + comparable(end)))) {
      problems.push(`"${start}" and "${end}" aren't on one line`)
    }
  }

  // A heading is on a line of its own: hiring software that finds a heading
  // by its line doesn't find one run into the text beside it.
  const headings = printedHeadings(resume, data)
  const at = headings.map((heading) => {
    const line = flat.indexOf(comparable(heading))
    if (line < 0) {
      const shared = texts.find((text) => comparable(text).startsWith(comparable(heading)))
      problems.push(shared ? `heading "${heading}" shares a line: "${shared}"` : `heading "${heading}" isn't on a line of its own`)
    }
    return line
  })
  const found = at.filter((line) => line >= 0)
  if (found.some((line, index) => index > 0 && line < found[index - 1])) {
    const read = headings.filter((_, index) => at[index] >= 0).sort((a, b) => flat.indexOf(comparable(a)) - flat.indexOf(comparable(b)))
    problems.push(`sections read as ${read.join(", ")}, printed as ${headings.join(", ")}`)
  }

  // The name, email and phone, before the first heading.
  const top = flat.slice(0, found.length ? Math.min(...found) : flat.length).join("")
  const contact: [string, string][] = [
    ["name", data.profile.name],
    ["email", data.profile.email],
    ["phone", data.profile.phone],
  ]
  for (const [label, value] of contact) {
    if (value && !top.includes(comparable(value))) problems.push(`the ${label}, "${value}", isn't read before the first heading`)
  }
  return problems
}

/**
 * What a template's sample reads wrongly as plain text, and why it's let be.
 * Anything else that starts reading wrongly fails the test.
 */
const KNOWN_PROBLEMS: Record<string, string[]> = {
  // Headings are set in the left margin, beside each section's first line,
  // so plain text reads the two as one line, and "Awards & Certifications"
  // wraps there onto two. resumezip's own reader splits them apart.
  margin: [
    'heading "Summary" shares a line: "Summary Product manager with seven years in travel marketplaces and sales software. I like hard ranking and"',
    'heading "Experience" shares a line: "Experience Airbnb Mar 2022 - Present"',
    'heading "Education" shares a line: "Education Northwestern University Sep 2014 - Jun 2018"',
    'heading "Projects" shares a line: "Projects Tabsplit · React, Firebase · priyaraman.com/tables 2023"',
    'heading "Skills" shares a line: "Skills Product: Roadmaps, A/B testing, user research, pricing, product specs"',
    'heading "Leadership" shares a line: "Leadership Women in Product, Bay Area Jan 2021 - Present"',
    'heading "Volunteer" shares a line: "Volunteer Code Tenderloin Sep 2019 - Mar 2021"',
    'heading "Awards & Certifications" isn\'t on a line of its own',
  ],
}

describe.each(samples.map((sample) => [sample.selectedTemplate as string, sample]))(
  "the %s sample, read as plain text",
  (template, sample) => {
    test("reads as it was printed", async () => {
      expect(readingProblems(sample, await plainText(await render(sample))), template).toEqual(KNOWN_PROBLEMS[template] ?? [])
    })

    test("keeps fi, fl and ff as letters where its font joins them", async () => {
      const words = "Certified in office workflow and fluent in efficient, affine shuffles"
      const resume = { ...sample, workExperienceSection: [{ ...sample.workExperienceSection[0], workDescription: `• ${words}` }] }
      const read = await plainText(await render(resume))
      expect(
        read.characters.filter((text) => text.match(UNREADABLE)),
        template,
      ).toEqual([])
      expect(read.characters.join(" ").replace(/\s+/g, " "), template).toContain(words)
    })
  },
)

test("every template has a sample to read", () => {
  expect(samples.map((sample) => sample.selectedTemplate).sort()).toEqual(TEMPLATES.map((template) => template.id).sort())
})

test("a ligature character, as text copied from a PDF brings, prints as its letters, and other fi's stay whole", async () => {
  // Typst gives each glyph one character in the PDF's text. A typed "ﬁ" used
  // to make it "ﬁ" for every "fi" the font joined: "final" read as "ﬁ nal".
  const sample = samples.find((resume) => resume.selectedTemplate === "jake")
  const [job] = sample.workExperienceSection
  const [fi, fl] = [0xfb01, 0xfb02].map((point) => String.fromCodePoint(point))
  const resume = { ...sample, workExperienceSection: [{ ...job, workDescription: `• Became AWS certi${fi}ed in a ${fl}ash` }] }
  const read = await plainText(await render(resume))
  expect(readingProblems(resume, read)).toEqual([])
  const text = read.characters.join(" ")
  expect(text).toContain("Became AWS certified in a flash")
  expect(text).toContain("before the final course submission")
})

describe("what reads wrongly is found, naming the text", () => {
  test("a ligature, a glyph pdf.js can't map, and the replacement character", () => {
    const [fi, replacement] = [0xfb01, 0xfffd].map((point) => String.fromCodePoint(point))
    const characters = [`AWS certi${fi}ed`, "Led (cid:12)ve teams", `Cut costs by 40 ${replacement}`]
    expect(readingProblems({ selectedTemplate: "jake" }, { lines: [], characters })).toEqual([
      `unreadable "${fi}" in "AWS certi${fi}ed"`,
      'unreadable "(cid:12)" in "Led (cid:12)ve teams"',
      `unreadable "${replacement}" in "Cut costs by 40 ${replacement}"`,
    ])
  })

  test("a date range split over two lines, a heading sharing a line, sections out of order and contact details below them", () => {
    const resume = {
      selectedTemplate: "jake",
      profileSection: { fullName: "Ada Lovelace", email: "ada@example.com", phoneNumber: "555 0100" },
      sectionOrder: ["Education", "Work", "Skills"],
      educationSection: [{ id: 1, schoolName: "London", schoolStartDate: "Sep 2020", schoolEndDate: "Jun 2024" }],
      workExperienceSection: [{ id: 1, companyName: "Babbage & Co", workStartDate: "Jul 2024", workEndDate: "Present" }],
      skillsSection: [{ id: 1, skillName: "Maths", skillDetails: "Analysis" }],
    }
    const lines = [
      "Ada Lovelace",
      "Experience",
      "Babbage & Co Jul 2024 -",
      "Present",
      "Education",
      "London Sep 2020 - Jun 2024",
      "Skills Maths: Analysis",
      "ada@example.com | 555 0100",
    ].map((text) => ({ text })) as Line[]
    expect(readingProblems(resume, { lines, characters: [] })).toEqual([
      '"Jul 2024" and "Present" aren\'t on one line',
      'heading "Skills" shares a line: "Skills Maths: Analysis"',
      "sections read as Experience, Education, printed as Education, Experience, Skills",
      'the email, "ada@example.com", isn\'t read before the first heading',
      'the phone, "555 0100", isn\'t read before the first heading',
    ])
  })
})
