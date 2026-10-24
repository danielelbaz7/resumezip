// Whether a resume's graduation date is in the window a posting asks for
// ("graduating between December 2026 and June 2027", "Class of 2027"). The
// AI reads the window from the posting, quoting it; the resume's date is read
// here from its education's end dates, as the checker reads dates
// (lib/check/readDate.ts), so nothing about it is the AI's guess.

import { latestOf, readDate } from "@/lib/check/readDate"
import { printedResume } from "@/lib/leftOut"
import type { Entry, Resume } from "@/lib/resume"

/** A year and maybe a month, as "2027" or "2027-05". */
export type YearMonth = string

/** When a posting asks people to graduate: either end can be open (""), not both. */
export interface GraduationWindow {
  earliest: YearMonth
  latest: YearMonth
  /** The posting's words it comes from. */
  quote: string
}

/** How a resume's graduation date fits a posting's window: null when the posting asks for none. */
export type GraduationFit = "fits" | "outside" | "unknown"

const YEAR_MONTH = /^(\d{4})(?:-(0[1-9]|1[0-2]))?$/

/** A year and month as the AI or storage gave it: "" for an open end, null when it isn't one. */
export function yearMonthOf(value: unknown): YearMonth | null {
  if (value === "") return ""
  return typeof value === "string" && YEAR_MONTH.test(value) ? value : null
}

// The first and last month a year-month can mean, counted in months: "2027" is all of 2027.
function monthsOf(value: YearMonth): [number, number] | null {
  const match = YEAR_MONTH.exec(value)
  if (!match) return null
  const year = Number(match[1])
  return match[2] ? [year * 12 + Number(match[2]) - 1, year * 12 + Number(match[2]) - 1] : [year * 12, year * 12 + 11]
}

/**
 * When the resume says its person graduates (or did): the latest end date of
 * its schools as printed, as "2027-05", or "2027" with no month. Null when
 * none has a date, or one says "Present", which says no date.
 */
export function graduationOf(saved: Resume): YearMonth | null {
  const resume = printedResume(saved)
  const schools: Entry[] = Array.isArray(resume.educationSection) ? resume.educationSection : []
  let latest: { year: number; month?: number } | null = null
  for (const school of schools) {
    const read = typeof school.schoolEndDate === "string" ? readDate(school.schoolEndDate) : null
    if (!read || read.present || read.year === undefined) continue
    const date = latestOf(read)
    if (date.present || date.year === undefined) continue
    const later = !latest || date.year > latest.year || (date.year === latest.year && (date.month ?? 12) > (latest.month ?? 12))
    if (later) latest = { year: date.year, month: date.month }
  }
  if (!latest) return null
  return latest.month ? `${latest.year}-${String(latest.month).padStart(2, "0")}` : String(latest.year)
}

/**
 * Whether `graduation` is in `window`: it fits when any month it can mean is
 * in it, so "2027" fits a window ending in June 2027. "unknown" when the
 * resume has no date to check.
 */
export function graduationFit(window: GraduationWindow, graduation: YearMonth | null): GraduationFit {
  const months = graduation ? monthsOf(graduation) : null
  if (!months) return "unknown"
  const from = window.earliest ? monthsOf(window.earliest)![0] : -Infinity
  const to = window.latest ? monthsOf(window.latest)![1] : Infinity
  return months[1] >= from && months[0] <= to ? "fits" : "outside"
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** A year-month as the list shows it: "May 2027", or "2027". */
export function yearMonthText(value: YearMonth): string {
  const match = YEAR_MONTH.exec(value)
  if (!match) return value
  return match[2] ? `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}` : match[1]
}

/** A window as the list shows it: "Dec 2026 – Jun 2027", "by Jun 2027", "from 2026". */
export function windowText({ earliest, latest }: GraduationWindow): string {
  if (earliest && latest) return earliest === latest ? yearMonthText(earliest) : `${yearMonthText(earliest)} – ${yearMonthText(latest)}`
  return earliest ? `from ${yearMonthText(earliest)}` : `by ${yearMonthText(latest)}`
}
