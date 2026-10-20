// Blueprint's own layout, checked on the printed page: each job's line of
// three (the role, the company and place centred, the dates) keeps all three
// readable and apart, however long the company and place are; and Blueprint
// hyphenates its text, but never a link or the name.

import { expect, test } from "vitest"
import type { PdfPage } from "@/lib/import/lines"
import { pagesOf, render, samples } from "@/lib/import/testRender"

type Item = PdfPage["items"][number]

const sample = samples.find((resume) => resume.selectedTemplate === "levelsfyi")

/** The first page of the sample as printed, with `changes` made to it. */
async function firstPage(changes: Record<string, unknown> = {}): Promise<PdfPage> {
  const [page] = await pagesOf(await render({ ...sample, ...changes }))
  return page
}

const withJob = (job: Record<string, string>) => {
  const [first, ...rest] = sample.workExperienceSection
  return { workExperienceSection: [{ ...first, ...job }, ...rest] }
}
const withProfile = (profile: Record<string, string>) => ({ profileSection: { ...sample.profileSection, ...profile } })

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
  const page = await firstPage(withJob(job))
  expect(overlaps(page)).toEqual([])
  // The role two lines at most, rather than a word a line, and the dates whole.
  expect(linesOf(page, job.workRole)).toBeLessThanOrEqual(2)
  expect(linesOf(page, `${job.workStartDate} - ${job.workEndDate}`)).toBe(1)
  // Still centred, give or take a comma ending a line, which Typst hangs past its end.
  expect(Math.abs(centre(printed(page, `${job.companyName}, ${job.workLocation}`)) - page.width / 2)).toBeLessThan(2)
})

/** Which printed piece of text holds `address`, or starts it when it's broken over lines. */
function startOf({ items }: PdfPage, address: string): number {
  const start = items.findIndex(({ text }) => text.includes(address) || (text.trim().length >= 12 && address.startsWith(text.trim())))
  if (start < 0) throw new Error(`"${address}" isn't printed`)
  return start
}

/**
 * The lines an address is printed on, as printed: a hyphen added to break it
 * shows as a piece of text of its own, or as a line ending partway through a word.
 */
function linesOfAddress(page: PdfPage, address: string): string[] {
  const { items } = page
  const start = startOf(page, address)
  if (items[start].text.includes(address)) return [address]
  const lines = [items[start].text.trim()]
  for (let next = start + 1; lines.join("").length < address.length && next < items.length; next++) {
    if (Math.abs(items[next].baseline - items[next - 1].baseline) < 1) lines[lines.length - 1] += items[next].text
    else lines.push(items[next].text)
  }
  return lines
}

/** An address printed whole: every character in order, and broken only after a /, - or ? it has. */
function expectWhole(page: PdfPage, address: string) {
  const lines = linesOfAddress(page, address)
  expect(lines.join("").slice(0, address.length), lines.join(" / ")).toBe(address)
  for (const line of lines.slice(0, -1)) expect(line, lines.join(" / ")).toMatch(/[-/?]$/)
}

test("the sample's contact details print in pairs, a line a pair, flush with the margins", async () => {
  const page = await firstPage()
  const { location, linkedin, phoneNumber, profileGithub, email, personalWebsite } = sample.profileSection
  for (const pair of [
    [location, linkedin],
    [phoneNumber, profileGithub],
    [email, personalWebsite],
  ]) {
    const [left, right] = pair.map((text) => page.items[startOf(page, text)])
    expect(left.baseline, pair.join(" and ")).toBeCloseTo(right.baseline, 1)
    expect(left.x).toBeCloseTo(28.8, 1)
    expect(right.right).toBeCloseTo(page.width - 28.8, 1)
  }
})

test("a long link in the header prints whole, without a hyphen added to it", async () => {
  const linkedin = "linkedin.com/in/alexandra-konstantina-papadopoulos-fitzgerald-123456789"
  const page = await firstPage(withProfile({ linkedin }))
  expectWhole(page, linkedin)
  // There's room for it beside where you are, so it isn't broken at all.
  expect(linesOfAddress(page, linkedin)).toHaveLength(1)
})

test("a long link in a publication breaks without a hyphen added to it", async () => {
  const link = "openreview.net/forum?id=accounttakeoverdetectionsequences"
  const [first, second] = sample.publicationsSection
  const publication = { ...second, publicationDetails: "New Orleans, Louisiana, United States, pages 101 to 112", publicationLink: link }
  expectWhole(await firstPage({ publicationsSection: [first, publication] }), link)
})

test("a long name wraps between its words, each line centred", async () => {
  const fullName = "Maximilianus Konstantinopoulos Wolfeschlegelsteinhausenbergerdorff"
  const page = await firstPage(withProfile({ fullName }))
  const lines = page.items.filter((item) => item.size > 20)
  expect(lines.map((line) => line.text).join(" ")).toBe(fullName)
  for (const line of lines) expect(Math.abs(centre([line]) - page.width / 2), line.text).toBeLessThan(1)
})

const LONG_EMAIL = "alexandra.konstantina.papadopoulos.fitzgerald@example.com"
const LONG_WEBSITE = "alexandrakonstantinapapadopoulosfitzgeraldmontgomery.dev"

test.each([
  ["a long email beside a website", LONG_EMAIL, "alexandrakonstantinapapadopoulos.dev", true],
  // Too wide together for the line, these two ran to 7.5 pt of each other.
  ["a long email beside a long website", LONG_EMAIL, LONG_WEBSITE, false],
  ["an email and a website each too long for half the line", LONG_EMAIL.replace("@", ".montgomery@"), LONG_WEBSITE, false],
])("%s print whole and apart", async (_, email, personalWebsite, oneLine) => {
  const page = await firstPage(withProfile({ email, personalWebsite }))
  expectWhole(page, email)
  expectWhole(page, personalWebsite)
  expect(overlaps(page)).toEqual([])
  const [left, right] = [email, personalWebsite].map((address) => page.items[startOf(page, address)])
  expect(Math.abs(left.baseline - right.baseline) < 1, `on one line, ${(right.x - left.right).toFixed(1)} pt apart`).toBe(oneLine)
  if (oneLine) expect(right.x - left.right).toBeGreaterThanOrEqual(12)
})
