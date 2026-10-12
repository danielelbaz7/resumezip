import type { TemplateId } from "@/lib/templates"
import RESULTS from "./results.json"

// What src/lib/import/readsCleanly.test.ts checks of each template's sample
// read as plain text, and what it found, which it writes to results.json
// (UPDATE_READ_RESULTS=1) and checks is up to date. The page says only what
// the test checks: that the text reads as typed, never that a template
// "passes" hiring software, which no test can show.

// `short` heads the check's column in the page's table.
export const READING_CHECKS = [
  {
    id: "letters",
    name: "Letters read as letters",
    short: "Letters",
    text: "No “fi” or “fl” joined into one sign, and no blanks for letters, so a search for “certified” finds it.",
  },
  {
    id: "dates",
    name: "Dates stay together",
    short: "Dates",
    text: "Each job’s and school’s start and end dates are read on one line.",
  },
  { id: "order", name: "Sections in order", short: "Order", text: "Sections are read in the order they’re printed." },
  {
    id: "contact",
    name: "Contact details first",
    short: "Contact",
    text: "Your name, email and phone are read before the first heading.",
  },
  {
    id: "headings",
    name: "Headings on their own line",
    short: "Headings",
    text: "Each heading is read on a line of its own, not run into the text beside it.",
  },
] as const

export type ReadingCheck = (typeof READING_CHECKS)[number]["id"]

/** For each template, what its sample read differently from what was printed, by check: nothing when it passes. */
export type ReadingResults = Record<TemplateId, Record<ReadingCheck, string[]>>

export const READING_RESULTS: ReadingResults = RESULTS

/**
 * Why a template's sample doesn't pass a check, in plain words, for each
 * template with something in results.json. The test checks they match.
 */
export const WHY_NOT: Partial<Record<TemplateId, string>> = {
  margin:
    "Margin puts its headings in the left margin, beside each section’s first line, so plain text reads a heading and that line together. resumezip’s own reader keeps them apart when it opens a PDF, but other software may not.",
}

/** The checks a template's sample passes. */
export const checksPassed = (id: TemplateId) => READING_CHECKS.filter((check) => READING_RESULTS[id][check.id].length === 0)
