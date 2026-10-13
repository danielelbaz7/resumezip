// How long the person has worked, and where they are in a career, read from
// the resume's own dates, for rules whose advice depends on it: how many
// pages a resume can run to (L1), and whether a graduation date needs its
// month (D9).

import { datesOf, latestOf, type ResumeDate } from "./readDate"
import type { Entry, ResumeView } from "./resume"
import { EXPERIENCED_WORK_YEARS, HIGH_SCHOOL_NAME, RECENT_GRAD_MONTHS } from "./settings"

// Months counted from year 0, so two dates subtract to the months between them.
const monthNumber = (year: number, month: number) => year * 12 + month - 1
const thisMonth = (today: Date) => monthNumber(today.getFullYear(), today.getMonth() + 1)

// The first month a date can mean: January for a year alone, a season's first month.
const firstMonth = (date: ResumeDate, now: number) =>
  date.present ? now : date.year === undefined ? undefined : monthNumber(date.year, date.month ?? 1)

// The last month a date can mean: December for a year alone, a season's last month.
function lastMonth(date: ResumeDate, now: number): number | undefined {
  const latest = latestOf(date)
  return latest.present ? now : latest.year === undefined ? undefined : monthNumber(latest.year, latest.month ?? 12)
}

/**
 * Years of work on the resume: the months its printed jobs cover, as
 * written, with overlapping jobs counted once and the gaps between jobs not
 * at all. A job still going, or with no end date (as `hasEnded` reads it),
 * runs to this month; one with only an end date counts for that date alone.
 * A date that only gives a year counts the whole year, so this errs long.
 */
export function yearsOfWork(resume: ResumeView, today: Date): number {
  const now = thisMonth(today)
  const spans = resume.sections.Work.flatMap((entry) => {
    const { start, end } = datesOf(entry)
    const from = start ? firstMonth(start.date, now) : end && firstMonth(end.date, now)
    const to = Math.min(end ? (lastMonth(end.date, now) ?? now) : now, now)
    // Not started yet, as an upcoming internship, or ending before it starts (D2's problem).
    return from === undefined || from > now || to < from ? [] : [{ from, to }]
  })
  spans.sort((a, b) => a.from - b.from)
  let months = 0
  let covered = -Infinity
  for (const { from, to } of spans) {
    if (to <= covered) continue
    months += to - Math.max(from, covered + 1) + 1
    covered = to
  }
  return months / 12
}

/** A high school, which isn't the graduation that matters to recruiters. */
export const isHighSchool = ({ values }: Entry) => HIGH_SCHOOL_NAME.test(values.schoolName) || HIGH_SCHOOL_NAME.test(values.degree)

export type Stage = "early" | "experienced"

/**
 * Early in a career means still in school or graduated in the last few years
 * (`RECENT_GRAD_MONTHS`) with little work behind them; anyone else is
 * experienced, as someone back for a master's after years of work is.
 * Unknown when no college entry has a date.
 */
export function stageOf(resume: ResumeView, today: Date): Stage | undefined {
  const now = thisMonth(today)
  const graduations = resume.sections.Education.filter((entry) => !isHighSchool(entry)).flatMap((entry) => {
    const { start, end } = datesOf(entry)
    // No end date, as with only a start, is still in school, as `hasEnded` reads it.
    if (!end) return start ? [now] : []
    const month = lastMonth(end.date, now)
    return month === undefined ? [] : [month]
  })
  if (graduations.length === 0) return undefined
  const recent = Math.max(...graduations) >= now - RECENT_GRAD_MONTHS
  return recent && yearsOfWork(resume, today) < EXPERIENCED_WORK_YEARS ? "early" : "experienced"
}
