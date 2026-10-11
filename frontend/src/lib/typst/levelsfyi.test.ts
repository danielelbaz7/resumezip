// Blueprint's own layout, checked on the printed page: each job's line of
// three (the role, the company and place centred, the dates) keeps all three
// readable and apart, however long the company and place are.

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { expect, test } from "vitest"
import { readPdf, type PdfPage } from "@/lib/import/lines"
import { render, samples } from "@/lib/import/testRender"

type Item = PdfPage["items"][number]

const sample = samples.find((resume) => resume.selectedTemplate === "levelsfyi")

/** The first page of the resume as printed, with `job` in place of its first job. */
async function firstPage(job: Record<string, string> = {}): Promise<PdfPage> {
  const [first, ...rest] = sample.workExperienceSection
  const pdf = await render({ ...sample, workExperienceSection: [{ ...first, ...job }, ...rest] })
  const doc = (await getDocument({ data: pdf, isEvalSupported: false, fontExtraProperties: true }).promise) as unknown as PDFDocumentProxy
  try {
    return (await readPdf(doc))[0]
  } finally {
    await doc.destroy()
  }
}

/** Pieces of text printed over each other on the same line, and by how much. */
function overlaps({ items }: PdfPage): string[] {
  return items.flatMap((item, i) =>
    items
      .slice(i + 1)
      .filter((other) => Math.abs(other.baseline - item.baseline) < 0.7 * item.size)
      .map((other) => ({ other, by: Math.min(item.right, other.right) - Math.max(item.x, other.x) }))
      .filter(({ by }) => by > 0.1)
      .map(({ other, by }) => `"${item.text}" and "${other.text}" by ${by.toFixed(1)} pt`),
  )
}

/**
 * The pieces of text that print `text`, one after another: a word apart, or
 * run together where one ends just as the next starts, like a bold company
 * and its comma. Throws if it isn't printed in that order.
 */
function printed({ items }: PdfPage, text: string): Item[] {
  for (let start = 0; start < items.length; start++) {
    let joined = items[start].text.trim()
    for (let end = start + 1; joined !== text && end < items.length && text.startsWith(joined); end++) {
      const [before, item] = [items[end - 1], items[end]]
      const touching = Math.abs(item.baseline - before.baseline) < 1 && Math.abs(item.x - before.right) < 1
      joined += (touching ? "" : " ") + item.text.trim()
      if (joined === text) return items.slice(start, end + 1)
    }
    if (joined === text) return [items[start]]
  }
  throw new Error(`"${text}" isn't printed`)
}

/** How many lines `text` takes up. */
const linesOf = (page: PdfPage, text: string) => new Set(printed(page, text).map((item) => Math.round(item.baseline))).size

const centre = (items: Item[]) => (Math.min(...items.map((item) => item.x)) + Math.max(...items.map((item) => item.right))) / 2

const LONG_JOB = {
  workRole: "Senior Machine Learning Engineer",
  companyName: "Johns Hopkins University Applied Physics Laboratory",
  workLocation: "Laurel, Maryland, United States",
  workStartDate: "September 2019",
  workEndDate: "Present",
}

test("the sample's jobs each print on one line, the company and place centred on the page", async () => {
  const page = await firstPage()
  for (const job of sample.workExperienceSection.slice(0, 2)) {
    const middle = printed(page, `${job.companyName}, ${job.workLocation}`)
    const row = [...printed(page, job.workRole), ...middle, ...printed(page, `${job.workStartDate} - ${job.workEndDate}`)]
    expect(new Set(row.map((item) => Math.round(item.baseline))).size, job.workRole).toBe(1)
    expect(centre(middle)).toBeCloseTo(page.width / 2, 0)
  }
  expect(overlaps(page)).toEqual([])
})

test.each([
  ["a long company and place", LONG_JOB],
  ["a company and place too long for the line", { ...LONG_JOB, workLocation: `${LONG_JOB.workLocation} of America (Hybrid)` }],
  ["a long company and place, and short dates", { ...LONG_JOB, workStartDate: "2019", workEndDate: "2020" }],
])("%s wrap in the middle, leaving the role and dates readable", async (_, job) => {
  const page = await firstPage(job)
  expect(overlaps(page)).toEqual([])
  // The role two lines at most, rather than a word a line, and the dates whole.
  expect(linesOf(page, job.workRole)).toBeLessThanOrEqual(2)
  expect(linesOf(page, `${job.workStartDate} - ${job.workEndDate}`)).toBe(1)
  // Still centred, give or take a comma ending a line, which Typst hangs past its end.
  expect(Math.abs(centre(printed(page, `${job.companyName}, ${job.workLocation}`)) - page.width / 2)).toBeLessThan(2)
})
