// The PDF rules on real PDFs: each template's sample, printed with the real
// Typst templates and read back the way hiring software would.

import { describe, expect, test } from "vitest"
import { readBack, render, samples } from "@/lib/import/testRender"
import { TEMPLATES } from "@/lib/templates"
import { runChecks, type PdfReading, type Report } from "./engine"
import { printedBullets } from "./pdf"
import { viewOf } from "./resume"
import { RULES } from "./rules"
import { readForChecks } from "@/lib/import/read"
import { pdfLayoutOf } from "./extraPdf"

async function readingOf(resume: Record<string, unknown>): Promise<PdfReading> {
  const { parsed, pages } = await readBack(await render(resume))
  const result = readForChecks(parsed.lines, pdfLayoutOf(viewOf(resume)))
  return { lines: result.parsed.lines, pages, ...result }
}

const PDF_RULES = RULES.filter((rule) => /^[RL]\d$/.test(rule.id))
const READABLE = PDF_RULES.filter((rule) => rule.category === "readable").map((rule) => rule.id)

function check(resume: Record<string, unknown>, pdf: PdfReading, ids?: string[]) {
  return runChecks(resume, { rules: ids ? PDF_RULES.filter((rule) => ids.includes(rule.id)) : PDF_RULES, pdf, today: new Date(2026, 9, 7) })
}

describe.each(samples.map((sample) => [sample.selectedTemplate as string, sample]))("the %s sample", (_template, sample) => {
  test("passes every readability rule, and fits its page", async () => {
    const report = check(sample, await readingOf(sample))
    expect(report.findings).toEqual([])
    expect(report.results.filter(({ status }) => status === "waiting" || status === "error")).toEqual([])
  })

  test("L3 and L4 find the bullet that wraps badly, and only that one", async () => {
    // The first bullet that wraps, cut to end with 2 words on its last line…
    const view = viewOf(sample)
    const wrapped = printedBullets(view, await readingOf(sample)).find(({ printed }) => printed.lines.length === 2)!
    const lastWords = wrapped.printed.lines[1].text.split(/\s+/).length
    const words = wrapped.bullet.text.split(/\s+/)
    const cut = words.slice(0, words.length - lastWords + 2).join(" ")
    // …and the bullet after it, run on to 3 lines or more.
    const entry = wrapped.entry
    const field = wrapped.bullet.field
    const others = entry.bullets.filter((bullet) => bullet !== wrapped.bullet)
    const long = `${others[0].text} ${others[0].text} ${others[0].text}`
    const section = Object.entries(sample).find(([, value]) => Array.isArray(value) && value[entry.index]?.[field] !== undefined)![0]
    const entries = [...sample[section]]
    entries[entry.index] = {
      ...entries[entry.index],
      [field]: [cut, long, ...others.slice(1).map((bullet) => bullet.text)].map((text) => `• ${text}`).join("\n"),
    }
    const resume = { ...sample, [section]: entries }

    const report = check(resume, await readingOf(resume), ["L3", "L4"])
    const at = (line: number) => ({ kind: "entry", section: entry.section, entry: entry.index, field, line })
    expect(report.findings.map(({ rule, place, message }) => ({ rule, place, message }))).toEqual([
      { rule: "L3", place: at(0), message: "2 words on its last line" },
      { rule: "L4", place: at(1), message: expect.stringMatching(/^Runs [3-9] lines$/) },
    ])
  })
})

test.each(["jake", "resumeworded"])(
  "the %s template's contact details and entries read back with any phone number, and names with ß",
  async (template) => {
    // resumeworded prints names and companies in capitals: "Strauß" as "STRAUSS".
    const sample = samples.find((resume) => resume.selectedTemplate === template)
    for (const phoneNumber of ["07911 123456", "06 12 34 56 78", "0412 345 678"]) {
      const [job, ...jobs] = sample.workExperienceSection
      const resume = {
        ...sample,
        profileSection: { ...sample.profileSection, fullName: "Max Strauß", phoneNumber },
        workExperienceSection: [{ ...job, companyName: "Großmann GmbH" }, ...jobs],
      }
      expect(check(resume, await readingOf(resume), ["R1", "R3"]).findings, phoneNumber).toEqual([])
    }
  },
)

// Characters no font has print as nothing, or as boxes, in every template.
// The checker used to say hiring software couldn't find the name or read the
// role, as if they were typed wrong.
describe.each(TEMPLATES.map((template) => [template.name, template.id]))("%s, with text no font has", (_name, template) => {
  const what = (report: Report) => report.findings.map(({ rule, place, message }) => ({ rule, place, message }))

  test("says only that it doesn't print", async () => {
    const resume = {
      selectedTemplate: template,
      profileSection: { fullName: "王小明", email: "wang@example.com", phoneNumber: "(512) 555-0142", location: "دبي, UAE" },
      workExperienceSection: [
        {
          id: 1,
          workRole: "软件工程师",
          companyName: "Stripe",
          workStartDate: "Jan 2024",
          workEndDate: "Present",
          workDescription: "• Built the ledger used by 300 teams",
        },
      ],
    }
    expect(what(check(resume, await readingOf(resume), READABLE))).toEqual([
      { rule: "R8", place: { kind: "profile", field: "fullName" }, message: "“王小明” doesn't print" },
      { rule: "R8", place: { kind: "profile", field: "location" }, message: "“دبي” doesn't print" },
      { rule: "R8", place: { kind: "entry", section: "Work", entry: 0, field: "workRole" }, message: "“软件工程师” doesn't print" },
    ])
  })

  test("in a name, leaves the rest of the resume read as before", async () => {
    const sample = samples.find((resume) => resume.selectedTemplate === template)
    const resume = { ...sample, profileSection: { ...sample.profileSection, fullName: `${sample.profileSection.fullName} 王小明` } }
    const report = check(resume, await readingOf(resume))
    expect(what(report)).toEqual([{ rule: "R8", place: { kind: "profile", field: "fullName" }, message: "“王小明” doesn't print" }])
    expect(report.results.filter(({ partial }) => partial).map(({ rule }) => rule.id)).toEqual([])
  })
})

test("a renamed heading the reader doesn't know is a fix", async () => {
  const sample = samples.find((resume) => resume.selectedTemplate === "jake")
  const resume = { ...sample, headings: { ...sample.headings, work: "My Journey" } }
  const report = check(resume, await readingOf(resume), ["R2"])
  expect(report.findings).toEqual([
    expect.objectContaining({
      level: "fix",
      place: { kind: "heading", section: "Work" },
      message: "Hiring software may not know “My Journey” as a heading",
    }),
  ])
})

test("a resume that runs onto a second page is flagged, unless it's academic", async () => {
  const sample = samples.find((resume) => resume.selectedTemplate === "jake")
  const resume = {
    ...sample,
    workExperienceSection: [...sample.workExperienceSection, ...sample.workExperienceSection, ...sample.workExperienceSection],
  }
  const pdf = await readingOf(resume)
  expect(pdf.pages.length).toBeGreaterThan(1)
  // The sample's jobs come to 1 whole year of work by the day these tests read dates on.
  expect(check(resume, pdf, ["L1"]).findings.map(({ message }) => message)).toEqual([`${pdf.pages.length} pages for 1 year of work`])
  expect(check({ ...resume, resumeTag: "academic" }, pdf, ["L1"]).results[0].status).toBe("skipped")
})
